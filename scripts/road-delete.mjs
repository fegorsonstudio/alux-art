// Deletes recorded roads (Bounty Run) for good: the rows and the mp4/poster on R2.
// Runs on the road_id are kept but detached (races.road_id becomes NULL).
//
//   node --env-file=.env.local scripts/road-delete.mjs <road id> [<road id> ...]
//   node --env-file=.env.local scripts/road-delete.mjs --name "Playwright test road"
import postgres from "postgres";
import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 2 });
const r2 = new S3Client({
  region: "auto", endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
});

const args = process.argv.slice(2);
let ids = args.filter((a) => /^[0-9a-f-]{36}$/.test(a));
const byName = args.indexOf("--name");
if (byName >= 0 && args[byName + 1]) {
  const rows = await sql`SELECT id FROM road_tracks WHERE name = ${args[byName + 1]}`;
  ids = ids.concat(rows.map((r) => r.id));
}
if (!ids.length) { console.log("nothing to delete"); await sql.end(); process.exit(0); }
const rows = await sql`SELECT id, video_path, poster_path FROM road_tracks WHERE id = ANY(${ids})`;
const keys = rows.flatMap((r) => [r.video_path, r.poster_path].filter(Boolean).map((Key) => ({ Key })));
if (keys.length) await r2.send(new DeleteObjectsCommand({ Bucket: "template-images", Delete: { Objects: keys } }));
const gone = await sql`DELETE FROM road_tracks WHERE id = ANY(${ids}) RETURNING id`;
console.log(`deleted ${gone.length} road(s), ${keys.length} file(s)`);
await sql.end();
