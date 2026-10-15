# Glow Retouch worker: finishes paid Glow Retouch orders (templates.category = 'photo_retouch').
#
# Run by cron every minute, as root, inside the memory fence (the VPS also runs the website):
#   * * * * * flock -n /tmp/aluxart-retouch.lock systemd-run --scope --quiet -p MemoryMax=1700M
#             -p MemorySwapMax=0 nice -n 10 /root/retouch-proof/venv/bin/python
#             /home/aluxart/app/workers/retouch/worker.py >> /root/retouch-worker/worker.log 2>&1
#
# By hand:  worker.py --shoot <id>   only that order
#           --no-paid                skip the paid steps (cut-out, eraser)
#           --quiet                  no Telegram alerts (tests)
#
# How an order gets here: the Instagram bot books it on the private "Glow Retouch"
# template, payment moves the shoot to QUEUED, and /api/shoots/[id]/start leaves it
# alone for this worker (it would otherwise go to the relight model in lib/generate.ts).
# Photo N of the order (shoot_references, purpose 'identity', in the same stable order
# lib/generate.ts uses) is retouched into slot N. Each photo runs in its own engine
# process, so a photo that runs out of memory takes only itself down.
#
# A photo the engine cannot finish safely is never sent half-done: the slot is marked
# FAILED, the studio is told on Telegram with a link to the original, and the delivery
# poller tells the customer a person will finish it. The finished shoot is delivered
# by /api/instagram/deliver exactly like a relight.
import os, re, sys, json, time, html, shutil, subprocess, urllib.parse, urllib.request
from datetime import datetime, timezone
import psycopg
from psycopg.rows import dict_row
import boto3
from botocore.config import Config

APP = "/home/aluxart/app"
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("RETOUCH_HOME", "/root/retouch-worker")
OUT_BUCKET = "generated-4k"
ENGINE_TIMEOUT = 15 * 60
MAX_STOPS = 2           # an engine that dies this many times on a photo hands it to a person
PAID_RETRIES = 3        # a paid step that fails this many times: finish without it, and say so
RUN_LIMIT = 20 * 60     # one cron run stops starting new orders after this

ARGS = sys.argv[1:]
ONLY = ARGS[ARGS.index("--shoot") + 1] if "--shoot" in ARGS else None
FORCE_NO_PAID = "--no-paid" in ARGS
QUIET = "--quiet" in ARGS

def log(*a):
    print(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)

def load_env(path):
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line: continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"": v = v[1:-1]
        os.environ.setdefault(k, v)

def tell(text):
    if QUIET:
        log("[alert, not sent]", text.replace("\n", " | ")); return
    tok, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), (os.environ.get("TELEGRAM_ADMIN_CHAT_ID") or "").strip()
    if not tok or not chat:
        log("no Telegram settings; alert not sent:", text[:200]); return
    try:
        data = urllib.parse.urlencode({"chat_id": chat, "text": text, "parse_mode": "HTML",
                                       "disable_web_page_preview": "true"}).encode()
        urllib.request.urlopen(f"https://api.telegram.org/bot{tok}/sendMessage", data, timeout=20).read()
    except Exception as e:
        log("Telegram alert failed:", str(e)[:200])

def attempts(stage):
    m = re.search(r"attempt (\d+)", stage or "")
    return int(m.group(1)) if m else 0

def r2():
    return boto3.client(
        "s3", endpoint_url=os.environ["R2_ENDPOINT"], region_name="auto",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        # R2 does not take the SDK's automatic checksum headers (same as lib/r2.ts)
        config=Config(signature_version="s3v4", request_checksum_calculation="when_required",
                      response_checksum_validation="when_required"))

def pick(conn):
    q = """SELECT s.id::text AS id, s.user_id::text AS user_id, s.status, s.ig_user_id, s.ig_account_id
           FROM shoots s JOIN templates t ON t.id = s.template_id
           WHERE t.category = 'photo_retouch' AND s.status IN ('QUEUED', 'PROCESSING')"""
    if ONLY: return conn.execute(q + " AND s.id = %s", (ONLY,)).fetchone()
    return conn.execute(q + " ORDER BY s.created_at LIMIT 1").fetchone()

def who(conn, shoot):
    if shoot["ig_user_id"]:
        row = conn.execute("""SELECT ig_username FROM instagram_sessions
                              WHERE ig_user_id = %s AND ig_account_id = %s LIMIT 1""",
                           (shoot["ig_user_id"], shoot["ig_account_id"])).fetchone()
        if row and row["ig_username"]: return "@" + row["ig_username"]
        return f"Instagram user {shoot['ig_user_id']}"
    return "a website order"

def run_engine(src, dst, report, work, no_paid):
    cmd = [sys.executable, os.path.join(HERE, "engine.py"), src, dst, report, work] + (["--no-paid"] if no_paid else [])
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=ENGINE_TIMEOUT, env=os.environ.copy())
        code, tail = p.returncode, (p.stderr or p.stdout or "").strip()[-400:]
    except subprocess.TimeoutExpired:
        code, tail = -1, f"took longer than {ENGINE_TIMEOUT // 60} minutes"
    rep = None
    if os.path.exists(report):
        try: rep = json.load(open(report))
        except Exception: rep = None
    return code, rep, tail

def slot_failed(conn, s3, shoot, sl, ref, reason, total):
    conn.execute("""UPDATE shoot_images SET status = 'FAILED', stage = %s, provider = 'retouch-worker',
                    provider_error = %s, updated_at = NOW() WHERE id = %s""",
                 (("Needs a person: " + reason)[:200], reason, sl["id"]))
    link = ""
    if ref:
        try:
            link = s3.generate_presigned_url("get_object", Params={"Bucket": ref["storage_bucket"], "Key": ref["storage_path"]},
                                             ExpiresIn=3 * 24 * 3600)
        except Exception: link = ""
    tell("✋ <b>Glow Retouch needs your hands</b>\n\n"
         f"Customer: {html.escape(who(conn, shoot))}\n"
         f"Shoot: <code>{shoot['id']}</code>\n"
         f"Photo {sl['slot']} of {total}: {html.escape(reason)}\n\n"
         "It was NOT sent to the customer. They will be told a person is finishing it."
         + (f"\n\nTheir original (link works 3 days):\n{html.escape(link)}" if link else ""))
    log(f"  slot {sl['slot']}: FAILED - {reason}")

def handle_slot(conn, s3, shoot, sl, ref, total, work_root):
    """Returns 'done', 'failed' or 'deferred' (try again next run)."""
    prior = attempts(sl["stage"])
    if sl["status"] == "GENERATING" and prior >= MAX_STOPS:
        slot_failed(conn, s3, shoot, sl, ref, "the retouch stopped part-way twice on this photo", total)
        return "failed"
    if not ref:
        slot_failed(conn, s3, shoot, sl, None, "no photo was attached for this slot", total)
        return "failed"
    attempt = prior + 1
    conn.execute("UPDATE shoot_images SET status = 'GENERATING', stage = %s, updated_at = NOW() WHERE id = %s",
                 (f"Retouching (attempt {attempt})", sl["id"]))

    work = os.path.join(work_root, f"slot-{sl['slot']}")
    os.makedirs(work, exist_ok=True)
    src = os.path.join(work, "original" + (os.path.splitext(ref["storage_path"])[1].lower() or ".jpg"))
    s3.download_file(ref["storage_bucket"], ref["storage_path"], src)
    dst, report = os.path.join(work, "retouched.jpg"), os.path.join(work, "report.json")

    t0 = time.time()
    code, rep, tail = run_engine(src, dst, report, work, FORCE_NO_PAID)
    if code == 3 and attempt >= PAID_RETRIES:
        why = (rep or {}).get("reason", "unknown")
        log(f"  slot {sl['slot']}: paid step failed {attempt} times ({why}); finishing without it")
        tell("⚠️ <b>Glow Retouch ran without its paid steps</b>\n\n"
             f"Customer: {html.escape(who(conn, shoot))}\nShoot: <code>{shoot['id']}</code>\n"
             f"Photo {sl['slot']} of {total}: the cut-out service failed {attempt} times "
             f"({html.escape(why[:200])}).\n\nSkin, eyes and teeth were still retouched. Stray hairs, "
             "background distractions and the studio backdrop were NOT done on this photo.")
        code, rep, tail = run_engine(src, dst, report, work, True)
    secs = round(time.time() - t0)

    if code == 0 and os.path.exists(dst) and rep:
        key = f"{shoot['user_id']}/{shoot['id']}/retouch-{sl['slot']}.jpg"
        s3.upload_file(dst, OUT_BUCKET, key, ExtraArgs={"ContentType": "image/jpeg"})
        size = os.path.getsize(dst)
        conn.execute("""UPDATE shoot_images SET status = 'COMPLETE', width = %s, height = %s,
                          file_size = %s, download_file_size = %s, stage = 'Retouched',
                          provider = 'retouch-worker', configured_model = 'glow-retouch-v1',
                          preview_storage_bucket = %s, preview_storage_path = %s,
                          download_storage_bucket = %s, download_storage_path = %s,
                          provider_error = NULL, updated_at = NOW()
                        WHERE id = %s""",
                     (rep.get("width"), rep.get("height"), size, size, OUT_BUCKET, key, OUT_BUCKET, key, sl["id"]))
        log(f"  slot {sl['slot']}: retouched in {secs}s - {'; '.join(rep.get('steps', []))} "
            f"(same person {rep.get('same_person_score')}, paid {len(rep.get('paid', []))} call(s))")
        return "done"
    if code == 2:
        slot_failed(conn, s3, shoot, sl, ref, (rep or {}).get("reason", "the engine could not finish it safely"), total)
        return "failed"
    if code == 3:
        why = (rep or {}).get("reason", "unknown")
        conn.execute("UPDATE shoot_images SET status = 'QUEUED', stage = %s, updated_at = NOW() WHERE id = %s",
                     (f"Waiting to retry the cut-out (attempt {attempt})", sl["id"]))
        log(f"  slot {sl['slot']}: paid step unavailable (attempt {attempt}): {why[:200]} - will retry")
        return "deferred"
    # The engine died (memory, crash, timeout) without a verdict.
    log(f"  slot {sl['slot']}: engine stopped (exit {code}) after {secs}s: {tail[-300:]}")
    if attempt >= MAX_STOPS:
        slot_failed(conn, s3, shoot, sl, ref, f"the retouch stopped part-way twice on this photo ({tail[-120:]})", total)
        return "failed"
    conn.execute("UPDATE shoot_images SET status = 'QUEUED', stage = %s, updated_at = NOW() WHERE id = %s",
                 (f"Retrying after the retouch stopped (attempt {attempt})", sl["id"]))
    return "deferred"

def progress(conn, sid):
    c = conn.execute("""SELECT count(*) FILTER (WHERE status = 'COMPLETE') AS done,
                               count(*) FILTER (WHERE status IN ('PENDING', 'QUEUED', 'GENERATING')) AS left_,
                               count(*) AS total
                        FROM shoot_images WHERE shoot_id = %s""", (sid,)).fetchone()
    if c["left_"] == 0:
        status = "COMPLETE" if c["done"] > 0 else "FAILED"
        conn.execute("""UPDATE shoots SET status = %s, progress = 100, pipeline_stage = %s,
                          completed_at = NOW(), updated_at = NOW()
                        WHERE id = %s AND status = 'PROCESSING'""",
                     (status, "Complete" if c["done"] else "No photos could be retouched", sid))
        return status, c
    conn.execute("""UPDATE shoots SET progress = %s, pipeline_stage = %s, updated_at = NOW() WHERE id = %s""",
                 (max(10, round(100 * c["done"] / max(1, c["total"]))), f"Retouched {c['done']}/{c['total']}", sid))
    return "PROCESSING", c

def process(conn, s3, shoot):
    sid = shoot["id"]
    claimed = conn.execute("""UPDATE shoots SET status = 'PROCESSING', progress = GREATEST(COALESCE(progress, 0), 5),
                                pipeline_stage = 'Retouching', updated_at = NOW()
                              WHERE id = %s AND status IN ('QUEUED', 'PROCESSING') RETURNING id""", (sid,)).fetchone()
    if not claimed: return "skipped"
    refs = conn.execute("""SELECT storage_bucket, storage_path FROM shoot_references
                           WHERE shoot_id = %s AND purpose = 'identity'
                           ORDER BY created_at ASC, id ASC""", (sid,)).fetchall()
    slots = conn.execute("SELECT id, slot, status, stage FROM shoot_images WHERE shoot_id = %s ORDER BY slot, id",
                         (sid,)).fetchall()
    log(f"shoot {sid}: {len(slots)} photo(s), {len(refs)} original(s)")
    work_root = os.path.join(BASE, "work", sid)
    outcome = "finished"
    try:
        for sl in slots:
            if sl["status"] not in ("PENDING", "QUEUED", "GENERATING"): continue
            ref = refs[sl["slot"] - 1] if 0 < sl["slot"] <= len(refs) else None
            try:
                r = handle_slot(conn, s3, shoot, sl, ref, len(slots), work_root)
            except Exception as e:      # storage or database trouble: leave it for the next run
                log(f"  slot {sl['slot']}: error {type(e).__name__}: {str(e)[:300]}")
                conn.execute("""UPDATE shoot_images SET status = 'QUEUED', stage = %s, updated_at = NOW()
                                WHERE id = %s""", (f"Retrying after an error (attempt {attempts(sl['stage']) + 1})", sl["id"]))
                r = "deferred"
            if r == "deferred":
                outcome = "deferred"; break
            progress(conn, sid)
    finally:
        shutil.rmtree(work_root, ignore_errors=True)    # customer photos never stay on disk
    status, c = progress(conn, sid)
    log(f"shoot {sid}: {status} ({c['done']}/{c['total']} retouched)")
    return outcome

def main():
    load_env(os.path.join(APP, ".env.local"))
    os.environ.setdefault("RETOUCH_FAL_LEDGER", os.path.join(BASE, "fal-ledger.jsonl"))
    os.makedirs(os.path.join(BASE, "work"), exist_ok=True)
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True, row_factory=dict_row)
    # app_config retouch_engine = 'laptop': the studio computer runs Fegorson Studio on these
    # orders through /api/retouch-worker (lib/retouch-worker.ts), so this worker stands aside.
    eng = conn.execute("SELECT value FROM app_config WHERE key = 'retouch_engine'").fetchone()
    if eng and eng["value"] == "laptop" and not ONLY:
        conn.close(); return
    s3 = r2()
    started, seen = time.time(), set()
    while time.time() - started < RUN_LIMIT:
        shoot = pick(conn)
        if not shoot or shoot["id"] in seen: break
        seen.add(shoot["id"])
        if process(conn, s3, shoot) == "deferred" or ONLY: break
    conn.close()

if __name__ == "__main__":
    main()
