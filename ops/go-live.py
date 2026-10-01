#!/usr/bin/env python3
"""Put technomutualism.org live on the Cloudflare Pages project, and send technomutualism.com there.

  CLOUDFLARE_EMAIL=... CLOUDFLARE_API_KEY=... python3 ops/go-live.py          # show the plan, change nothing
  CLOUDFLARE_EMAIL=... CLOUDFLARE_API_KEY=... python3 ops/go-live.py --apply  # do it, then check it

Safe to run again: anything already in place is left alone.

What it sets up:
  technomutualism.org      the site (Pages custom domain, CNAME to technomutualism.pages.dev)
  www.technomutualism.org  301 to https://technomutualism.org/<same path>
  technomutualism.com      301 to https://technomutualism.org/<same path> (www too)
  both zones               SPF "-all" + DMARC reject: neither domain sends mail, so mail claiming to be from it is refused
"""
import json
import sys
import time
import urllib.error
import urllib.request

ACCOUNT = "151a28c4fd1e6ee09768f4226be76b4d"
PROJECT = "technomutualism"
PAGES_HOST = "technomutualism.pages.dev"
ORG, COM = "technomutualism.org", "technomutualism.com"
PARKED = "192.0.2.1"  # documentation address: the redirect answers at Cloudflare's edge, nothing is ever fetched from it

APPLY = "--apply" in sys.argv


def env(name):
    import os
    v = os.environ.get(name)
    if not v:
        sys.exit(f"{name} is not set")
    return v


HEADERS = {
    "X-Auth-Email": env("CLOUDFLARE_EMAIL"),
    "X-Auth-Key": env("CLOUDFLARE_API_KEY"),
    "Content-Type": "application/json",
}


def cf(method, path, body=None, ok_codes=()):
    req = urllib.request.Request(
        "https://api.cloudflare.com/client/v4" + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers=HEADERS,
        method=method,
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        d = json.load(e)
        if any(err.get("code") in ok_codes for err in d.get("errors", [])):
            return d
        raise SystemExit(f"{method} {path} failed: {d.get('errors')}")


def step(text):
    print(("APPLY  " if APPLY else "PLAN   ") + text)


def zone_id(name):
    return cf("GET", f"/zones?name={name}")["result"][0]["id"]


def ensure_record(zid, rtype, name, content, proxied=None):
    existing = cf("GET", f"/zones/{zid}/dns_records?type={rtype}&name={name}")["result"]
    if any(r["content"].strip('"') == content.strip('"') for r in existing):
        print(f"ok     {rtype} {name} -> {content}")
        return
    if existing:
        sys.exit(f"STOP   {rtype} {name} already points elsewhere: {[r['content'] for r in existing]} (left alone)")
    step(f"{rtype} {name} -> {content}" + (" (proxied)" if proxied else ""))
    if APPLY:
        body = {"type": rtype, "name": name, "content": content, "ttl": 1}
        if proxied is not None:
            body["proxied"] = proxied
        cf("POST", f"/zones/{zid}/dns_records", body)


def ensure_redirects(zid, label, rules):
    path = f"/zones/{zid}/rulesets/phases/http_request_dynamic_redirect/entrypoint"
    current = cf("GET", path, ok_codes=(10003,))
    have = {r.get("description") for r in ((current.get("result") or {}).get("rules") or [])}
    missing = [r for r in rules if r["description"] not in have]
    if not missing:
        print(f"ok     {label} redirect rules")
        return
    for r in missing:
        step(f"{label} redirect: {r['description']}")
    if APPLY:
        keep = [
            {k: v for k, v in r.items() if k in ("expression", "action", "action_parameters", "description", "enabled")}
            for r in ((current.get("result") or {}).get("rules") or [])
        ]
        cf("PUT", path, {"rules": keep + missing})


def redirect_rule(description, expression):
    return {
        "description": description,
        "expression": expression,
        "action": "redirect",
        "action_parameters": {
            "from_value": {
                "status_code": 301,
                "target_url": {"expression": f'concat("https://{ORG}", http.request.uri.path)'},
                "preserve_query_string": True,
            }
        },
        "enabled": True,
    }


def main():
    org, com = zone_id(ORG), zone_id(COM)

    # 1. The site on technomutualism.org
    ensure_record(org, "CNAME", ORG, PAGES_HOST, proxied=True)
    ensure_record(org, "CNAME", f"www.{ORG}", PAGES_HOST, proxied=True)
    domains = {d["name"] for d in cf("GET", f"/accounts/{ACCOUNT}/pages/projects/{PROJECT}/domains")["result"]}
    if ORG in domains:
        print(f"ok     Pages custom domain {ORG}")
    else:
        step(f"Pages custom domain {ORG} on project {PROJECT}")
        if APPLY:
            cf("POST", f"/accounts/{ACCOUNT}/pages/projects/{PROJECT}/domains", {"name": ORG})
    ensure_redirects(org, ORG, [redirect_rule("www to apex", f'(http.host eq "www.{ORG}")')])

    # 2. technomutualism.com -> .org
    ensure_record(com, "A", COM, PARKED, proxied=True)
    ensure_record(com, "A", f"www.{COM}", PARKED, proxied=True)
    ensure_redirects(com, COM, [redirect_rule(".com to .org", "true")])

    # 3. Neither domain sends mail: refuse mail forged in its name
    for zid, name in ((org, ORG), (com, COM)):
        ensure_record(zid, "TXT", name, '"v=spf1 -all"')
        ensure_record(zid, "TXT", f"_dmarc.{name}", '"v=DMARC1; p=reject; adkim=s; aspf=s"')

    if not APPLY:
        print("\nNothing changed. Run again with --apply.")
        return

    # 4. Check what a visitor gets (certificates can take a few minutes on a new custom domain)
    print("\nChecking (allow up to ~10 minutes for the new certificate)...")
    checks = [
        (f"https://{ORG}/", 200, None),
        (f"https://{ORG}/history", 200, None),
        (f"https://www.{ORG}/history", 301, f"https://{ORG}/history"),
        (f"https://{COM}/questions", 301, f"https://{ORG}/questions"),
        (f"https://www.{COM}/", 301, f"https://{ORG}/"),
    ]

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    deadline = time.time() + 900
    pending = list(checks)
    while pending and time.time() < deadline:
        still = []
        for url, want, location in pending:
            try:
                r = opener.open(url, timeout=15)
                got, loc = r.status, None
            except urllib.error.HTTPError as e:
                got, loc = e.code, e.headers.get("Location")
            except Exception as e:  # DNS/TLS not ready yet
                got, loc = str(e)[:60], None
            if got == want and (location is None or loc == location):
                print(f"ok     {url} -> {got}" + (f" {loc}" if loc else ""))
            else:
                still.append((url, want, location))
        pending = still
        if pending:
            time.sleep(30)
    for url, want, location in pending:
        print(f"NOT YET {url} (want {want}{' ' + location if location else ''})")
    if pending:
        sys.exit(1)

    # 5. A dated public record of first use
    try:
        urllib.request.urlopen(urllib.request.Request(f"https://web.archive.org/save/https://{ORG}/", method="GET"), timeout=120)
        print(f"ok     Wayback Machine snapshot requested for https://{ORG}/")
    except Exception as e:
        print(f"note   Wayback snapshot request failed ({e}); retry at https://web.archive.org/save")


if __name__ == "__main__":
    main()
