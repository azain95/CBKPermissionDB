const Pool = require ("pg").Pool;

const pool = new Pool({
user : "postgres",
password : 'topg',
host : "localhost",
port: 5432,
database: "cbkpermissionsdb"

})

module.exports = pool; 