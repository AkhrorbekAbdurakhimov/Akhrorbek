const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const CONFIG = require("../config/index");

module.exports = function(req, res, next) {
  if (req.headers.token) {
    jwt.verify(req.headers.token, CONFIG.SECRET, (err, decoded) => {
      const pool = new Pool(CONFIG.DB);
      if (err) {
        pool.query(
          `DELETE FROM kv_session WHERE token = MD5('${req.headers.token}');`
        );
        return res.send({ status: 401, message: "Unauthorized", err });
      }

      const token = jwt.sign({ data: decoded.data }, CONFIG.SECRET, {
        expiresIn: parseInt(CONFIG.SESSION_TIMEOUT)
      });

      res.setHeader("token", token);

      pool.query(
        `UPDATE kv_users SET last_seen = NOW() WHERE id = ${decoded.data[0].id}`,
        err => {
          if (err)
            return res.send({
              status: 500,
              message: "Could not connect to database"
            });
          req.pgPool = pool;
          req.user = decoded;
          next();
        }
      );
    });
  } else {
    res.send({ status: 401, message: "Unauthorized" });
  }
};
