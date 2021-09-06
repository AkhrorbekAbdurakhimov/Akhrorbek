const { Pool } = require("pg");
const { DB } = require("../config/index");
module.exports.clean = () => {
  const pool = new Pool(DB);
  pool.query(
    "DELETE FROM kv_session WHERE last_seen < CURRENT_TIMESTAMP - INTERVAL '5 minute'",
    err => {
      pool.end();
      if (err) console.log("Could not clear the session");
    }
  );
};
