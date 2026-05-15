// api/_lib/db.ts
// Neon 数据库客户端

import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)
export default sql
