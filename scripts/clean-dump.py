#!/usr/bin/env python3
"""
Clean a Supabase pg_dump for import into a plain PostgreSQL instance.
Removes: RLS policies, auth.users FK refs, auth.* functions, storage.*,
         handle_new_user trigger/function, is_admin function.

Usage:
  python3 scripts/clean-dump.py /tmp/supabase_dump.sql /tmp/clean_dump.sql
"""

import re
import sys

src = sys.argv[1] if len(sys.argv) > 1 else "/tmp/supabase_dump.sql"
dst = sys.argv[2] if len(sys.argv) > 2 else "/tmp/clean_dump.sql"

with open(src, "r") as f:
    sql = f.read()

original_lines = sql.count("\n")

# 1. Remove multi-line CREATE POLICY blocks (greedy to next semicolon)
sql = re.sub(r"\nCREATE POLICY\b[^;]+;", "", sql, flags=re.DOTALL)

# 2. Remove ALTER TABLE ... ENABLE / FORCE ROW LEVEL SECURITY
sql = re.sub(r"\nALTER TABLE[^\n]+(?:ENABLE|FORCE) ROW LEVEL SECURITY;", "", sql)

# 3. Remove inline FOREIGN KEY constraints referencing auth.users inside CREATE TABLE
#    Handles both:  ,\n    CONSTRAINT x FK (...) REFERENCES auth.users(...)
#               and bare REFERENCES auth.users at end of a column line
sql = re.sub(
    r",\s*\n\s*CONSTRAINT \w+ FOREIGN KEY \([^)]+\) REFERENCES auth\.users[^,\n)]*",
    "",
    sql,
    flags=re.DOTALL,
)
# Also strip trailing REFERENCES auth.users on column definitions
sql = re.sub(r"\s+REFERENCES auth\.users\([^)]+\)(?:\s+ON DELETE \w+)?", "", sql)

# 4. Remove CREATE [OR REPLACE] FUNCTION public.handle_new_user() ... $$ ... $$ LANGUAGE ...;
sql = re.sub(
    r"\nCREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+(?:public\.)?handle_new_user\(\)[^$]*"
    r"\$\$.*?\$\$[^;]*;",
    "",
    sql,
    flags=re.DOTALL,
)

# 5. Remove CREATE [OR REPLACE] FUNCTION public.is_admin() ... $$ ... $$ LANGUAGE ...;
sql = re.sub(
    r"\nCREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+(?:public\.)?is_admin\(\)[^$]*"
    r"\$\$.*?\$\$[^;]*;",
    "",
    sql,
    flags=re.DOTALL,
)

# 6. Remove CREATE TRIGGER handle_new_user (and ON_CONFLICT variants)
sql = re.sub(
    r"\nCREATE\s+TRIGGER\s+\w*handle_new_user\b[^;]+;", "", sql, flags=re.DOTALL
)

# 7. Remove any lines that reference storage.* schemas
sql = re.sub(r"\n[^\n]*\bstorage\.[^\n]*", "", sql)

# 8. Remove any lines that reference auth.jwt() or auth.uid()
sql = re.sub(r"\n[^\n]*\bauth\.(?:jwt|uid)\(\)[^\n]*", "", sql)

# 9. Remove GRANT / REVOKE statements (Supabase role-specific permissions)
sql = re.sub(r"\n(?:GRANT|REVOKE)[^;]+;", "", sql, flags=re.DOTALL)

# 10. Remove ALTER DEFAULT PRIVILEGES blocks
sql = re.sub(r"\nALTER DEFAULT PRIVILEGES[^;]+;", "", sql, flags=re.DOTALL)

# 11. Remove CREATE EXTENSION IF NOT EXISTS lines that may conflict
#     (keep pg_crypto / uuid-ossp which are safe, remove supabase-specific ones)
sql = re.sub(
    r"\nCREATE EXTENSION IF NOT EXISTS[^\n]*(supabase|pg_net|http|pgsodium|vault)[^\n]*",
    "",
    sql,
)

with open(dst, "w") as f:
    f.write(sql)

cleaned_lines = sql.count("\n")
print(f"Done: {src} -> {dst}")
print(f"Lines: {original_lines} -> {cleaned_lines} ({original_lines - cleaned_lines} removed)")
