const ping = require("ping");
const { Pool } = require("pg");
const { DB, PING_INTERVAL } = require("../config/index");
const isReachable = require("is-port-reachable");

module.exports.init = () => {
  probe();
  setInterval(() => {
    probe();
  }, PING_INTERVAL);
};

module.exports.probeIp = (ip, cb) => {
  ping.sys.probe(ip, (isAlive) => {
    cb(isAlive);
  });
};

module.exports.isPortReachable = async (ip, port, cb) => {
  cb(await isReachable(port, { host: ip }));
};

const probe = () => {
  const pool = new Pool(DB);
  pool.query(`SELECT id, ip_address FROM kv_cctv_cameras`, (err, res) => {
    if (err) return console.log("Couldnot get the list of CCTV cameras");
    res.rows.forEach((cctv, index) => {
      ping.sys.probe(cctv.ip_address, (isAlive) => {
        if (isAlive) {
          pool.query(`UPDATE kv_cctv_cameras SET last_update = NOW() WHERE id =${cctv.id}`, (err) => {
            if (err) console.log("Could not update CCTV " + cctv.ip_address);
            if (res.rowCount === index - 1) pool.end();
          });
        }
      });
    });
  });
};
