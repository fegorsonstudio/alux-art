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

# ── the retouch director, while the studio computer renders (app_config retouch_director = 'on') ──
# Briefs before the laptop renders, checks after (workers/retouch/director.py). The laptop is
# handed only photos with a brief ready, and its result waits here for the check before the
# customer sees it: pass -> COMPLETE; fail -> one second pass with the checker's corrections;
# fail again -> the studio (Telegram, with the original and the last result), never the customer.

def director_fail(conn, s3, img, reason, result=None):
    conn.execute("""UPDATE shoot_images SET status = 'FAILED', stage = %s, provider = 'fegorson-studio',
                    provider_error = %s, updated_at = NOW() WHERE id = %s""",
                 (("Needs a person: " + reason)[:200], reason[:1000], img["image_id"]))
    links = []
    for label, bucket, key in (("Original", img.get("ref_bucket"), img.get("ref_path")), ("Last attempt", "generated-4k", result)):
        if bucket and key:
            try: links.append(f"{label}: " + s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=3 * 24 * 3600))
            except Exception: pass
    shoot = {"id": img["shoot_id"], "ig_user_id": img.get("ig_user_id"), "ig_account_id": img.get("ig_account_id")}
    tell("✋ <b>Glow Retouch needs your hands</b>\n\n"
         f"Customer: {html.escape(who(conn, shoot))}\nShoot: <code>{img['shoot_id']}</code>\n"
         f"Photo {img['slot']}: {html.escape(reason[:600])}\n\n"
         "It was NOT sent to the customer. They will be told a person is finishing it."
         + ("\n\n" + "\n".join(html.escape(l) for l in links) if links else ""))
    log(f"  director: slot {img['slot']} of {img['shoot_id'][:8]} handed to a person - {reason[:160]}")

def director_duties(conn, s3):
    rendered = conn.execute("""SELECT b.id::text AS brief_id, b.pass, b.brief, b.candidates, b.recipe, b.result_path, b.cost_usd, b.qa,
                                      i.id::text AS image_id, i.slot, s.id::text AS shoot_id, s.user_id::text AS user_id,
                                      s.ig_user_id, s.ig_account_id
                               FROM retouch_briefs b JOIN shoot_images i ON i.id = b.shoot_image_id JOIN shoots s ON s.id = b.shoot_id
                               WHERE b.status = 'rendered' ORDER BY b.updated_at LIMIT 3""").fetchall()
    fresh = conn.execute("""SELECT i.id::text AS image_id, i.slot, s.id::text AS shoot_id, s.user_id::text AS user_id,
                                   s.ig_user_id, s.ig_account_id
                            FROM shoot_images i JOIN shoots s ON s.id = i.shoot_id JOIN templates t ON t.id = s.template_id
                            WHERE t.category = 'photo_retouch' AND s.status IN ('QUEUED', 'PROCESSING')
                              AND i.status IN ('PENDING', 'QUEUED')
                              AND NOT EXISTS (SELECT 1 FROM retouch_briefs b WHERE b.shoot_image_id = i.id)
                            ORDER BY s.created_at, i.slot LIMIT 3""").fetchall()
    if not rendered and not fresh: return
    sys.path.insert(0, HERE)
    import director as D                      # loads the models: only when there is work
    from PIL import Image as PILImage

    def original(shoot_id, slot, dest):
        refs = conn.execute("""SELECT storage_bucket, storage_path FROM shoot_references
                               WHERE shoot_id = %s AND purpose = 'identity' ORDER BY created_at ASC, id ASC""", (shoot_id,)).fetchall()
        if not 0 < slot <= len(refs): return None, None
        ref = refs[slot - 1]
        path = os.path.join(dest, "original" + (os.path.splitext(ref["storage_path"])[1].lower() or ".jpg"))
        s3.download_file(ref["storage_bucket"], ref["storage_path"], path)
        return path, ref

    # 1. Checks first: those customers are nearest to their photos.
    for r in rendered:
        work = os.path.join(BASE, "work", "check-" + r["brief_id"]); os.makedirs(work, exist_ok=True)
        img = None
        try:
            src, ref = original(r["shoot_id"], r["slot"], work)
            res_path = os.path.join(work, "result.jpg"); s3.download_file("generated-4k", r["result_path"], res_path)
            img = dict(r, ref_bucket=ref["storage_bucket"] if ref else None, ref_path=ref["storage_path"] if ref else None)
            brief, found, recipe = r["brief"] or {}, r["candidates"] or {}, r["recipe"] or {}
            if brief.get("fallback"):
                qa, cost = {"passed": True, "note": "director unavailable: the owner's preset only"}, 0.0
            else:
                qa, cost = D.check(D.load(src), D.load(res_path), found, brief, work, recipe=recipe)
            conn.execute("UPDATE retouch_briefs SET qa = %s, cost_usd = cost_usd + %s, updated_at = NOW() WHERE id = %s",
                         (json.dumps(qa), cost, r["brief_id"]))
            if qa.get("passed"):
                with PILImage.open(res_path) as im: w, h = im.size
                size = os.path.getsize(res_path)
                conn.execute("""UPDATE shoot_images SET status = 'COMPLETE', width = %s, height = %s, file_size = %s,
                                  download_file_size = %s, stage = %s, provider = 'fegorson-studio',
                                  configured_model = %s, preview_storage_bucket = 'generated-4k', preview_storage_path = %s,
                                  download_storage_bucket = 'generated-4k', download_storage_path = %s,
                                  provider_error = NULL, updated_at = NOW()
                                WHERE id = %s AND status = 'GENERATING'""",
                             (w, h, size, size, f"Retouched and checked (pass {r['pass']}, score {qa.get('score')})",
                              f"director/fegorson-studio pass {r['pass']}", r["result_path"], r["result_path"], r["image_id"]))
                conn.execute("UPDATE retouch_briefs SET status = 'passed', updated_at = NOW() WHERE id = %s", (r["brief_id"],))
                log(f"  director: slot {r['slot']} of {r['shoot_id'][:8]} passed its check (pass {r['pass']}, score {qa.get('score')})")
            elif r["pass"] < 2:
                nxt = D.next_recipe(recipe, qa, found)
                conn.execute("UPDATE retouch_briefs SET status = 'redo', updated_at = NOW() WHERE id = %s", (r["brief_id"],))
                conn.execute("""INSERT INTO retouch_briefs (shoot_image_id, shoot_id, pass, status, brief, candidates, recipe)
                                VALUES (%s, %s, %s, 'ready', %s, %s, %s)""",
                             (r["image_id"], r["shoot_id"], r["pass"] + 1, json.dumps(brief), json.dumps(found), json.dumps(nxt)))
                conn.execute("UPDATE shoot_images SET status = 'QUEUED', stage = %s, updated_at = NOW() WHERE id = %s",
                             (f"Brief ready (pass {r['pass'] + 1})", r["image_id"]))
                log(f"  director: slot {r['slot']} of {r['shoot_id'][:8]} failed its check, second pass queued")
            else:
                conn.execute("UPDATE retouch_briefs SET status = 'failed', updated_at = NOW() WHERE id = %s", (r["brief_id"],))
                probs = "; ".join(f"{p.get('area')}: {p.get('what')}" for p in (qa.get("problems") or [])[:4]) or "did not pass the check"
                director_fail(conn, s3, img, f"failed the check twice - {probs}", r["result_path"])
            progress(conn, r["shoot_id"])
        except Exception as e:
            log(f"  director: check of {r['brief_id'][:8]} stopped: {type(e).__name__}: {str(e)[:200]}")
            # Each try may already have paid for the AI: three crashes and a person takes it.
            try:
                errors = int(((r.get("qa") or {}).get("errors") or 0) if isinstance(r.get("qa"), dict) else 0) + 1
                conn.execute("UPDATE retouch_briefs SET qa = %s, updated_at = NOW() WHERE id = %s",
                             (json.dumps({"errors": errors, "last": f"{type(e).__name__}: {str(e)[:200]}"}), r["brief_id"]))
                if errors >= 3:
                    conn.execute("UPDATE retouch_briefs SET status = 'failed', updated_at = NOW() WHERE id = %s", (r["brief_id"],))
                    director_fail(conn, s3, img or dict(r, ref_bucket=None, ref_path=None),
                                  f"the check stopped three times ({type(e).__name__})", r["result_path"])
                    progress(conn, r["shoot_id"])
            except Exception as e2:
                log(f"  director: could not record the stopped check: {type(e2).__name__}: {str(e2)[:200]}")
        finally:
            shutil.rmtree(work, ignore_errors=True)

    # 2. Briefs for photos nobody has looked at yet.
    for r in fresh:
        work = os.path.join(BASE, "work", "brief-" + r["image_id"]); os.makedirs(work, exist_ok=True)
        try:
            src, ref = original(r["shoot_id"], r["slot"], work)
            if not src:
                img = dict(r, ref_bucket=None, ref_path=None)
                conn.execute("UPDATE shoot_images SET status = 'GENERATING' WHERE id = %s", (r["image_id"],))
                director_fail(conn, s3, img, "no photo was attached for this slot"); progress(conn, r["shoot_id"]); continue
            try:
                im = D.load(src); found = D.find(im); brief, cost = D.decide(im, found, work); recipe = D.recipe_from(brief, found)
            except Exception as e:     # the AI is down: the laptop still retouches with the owner's preset
                found, brief, recipe, cost = {}, {"fallback": True, "error": str(e)[:300]}, {}, 0.0
                tell("⚠️ <b>Retouch director unavailable</b> - photo " + str(r["slot"]) + " of shoot <code>" + r["shoot_id"] +
                     "</code> is being retouched with your preset only.\n" + html.escape(str(e)[:200]))
            conn.execute("""INSERT INTO retouch_briefs (shoot_image_id, shoot_id, pass, status, brief, candidates, recipe, cost_usd)
                            VALUES (%s, %s, 1, 'ready', %s, %s, %s, %s)""",
                         (r["image_id"], r["shoot_id"], json.dumps(brief), json.dumps(found), json.dumps(recipe), cost))
            conn.execute("UPDATE shoot_images SET status = 'QUEUED', stage = 'Brief ready (pass 1)', updated_at = NOW() WHERE id = %s",
                         (r["image_id"],))
            conn.execute("""UPDATE shoots SET status = 'PROCESSING', progress = GREATEST(COALESCE(progress, 0), 5),
                              pipeline_stage = 'Retouching', updated_at = NOW() WHERE id = %s AND status = 'QUEUED'""", (r["shoot_id"],))
            log(f"  director: brief for slot {r['slot']} of {r['shoot_id'][:8]} - {len(recipe.get('healStrokes') or [])} spot(s), "
                f"{len(brief.get('brief') or [])} areas, ${cost}")
        except Exception as e:
            log(f"  director: brief for {r['image_id'][:8]} stopped: {type(e).__name__}: {str(e)[:200]}")
        finally:
            shutil.rmtree(work, ignore_errors=True)

def main():
    load_env(os.path.join(APP, ".env.local"))
    os.environ.setdefault("RETOUCH_FAL_LEDGER", os.path.join(BASE, "fal-ledger.jsonl"))
    os.makedirs(os.path.join(BASE, "work"), exist_ok=True)
    conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True, row_factory=dict_row)
    # app_config retouch_engine = 'laptop': the studio computer runs Fegorson Studio on these
    # orders through /api/retouch-worker (lib/retouch-worker.ts), so this worker stands aside.
    eng = conn.execute("SELECT value FROM app_config WHERE key = 'retouch_engine'").fetchone()
    if eng and eng["value"] == "laptop" and not ONLY:
        # The laptop renders; this worker only writes briefs and checks results, when the
        # retouch director is switched on.
        dr = conn.execute("SELECT value FROM app_config WHERE key = 'retouch_director'").fetchone()
        if dr and dr["value"] == "on":
            director_duties(conn, r2())
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
