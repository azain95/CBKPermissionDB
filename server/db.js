import pkg from "pg";

const { Pool } = pkg;

export default new Pool({
  user: "postgres",
  password: "topg",
  host: "postgres",
  port: 5432,
  database: "cbkpermissionsdb",
});
