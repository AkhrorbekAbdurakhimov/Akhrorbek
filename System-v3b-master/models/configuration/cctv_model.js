const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");

const schema = Joi.object({
  name: Joi.string().required(),
  ip_address: Joi.string().required(),
  key: Joi.number().required(),
});

const table = "kv_cctv_cameras";

//  all request starts with /cctv

router.get("/", (req, res) => {
  const schema = Joi.object({
    offset: Joi.number().default(0),
    limit: Joi.number().default(10),
  });
  const { error, value } = schema.validate(req.query);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  req.pgPool.query(
    `SELECT 
      kc.id AS key, kc.title AS name, kc.ip_address, kc.crossroad_id, to_char(kc.last_update, 'YYYY-MM-DD HH24:MI:SS') AS last_update, kr.title AS c_name 
    FROM 
      ${table} kc 
    JOIN 
      kv_crossroads kr ON kc.crossroad_id = kr.id
    ORDER BY
      kr.ip_address ASC
    LIMIT 
      ${value.limit}
    OFFSET
      ${value.offset};`,
    (err, result) => {
      if (err) {
        req.pgPool.end();
        return res.send({ status: 500, message: "Internal server error" });
      }
      req.pgPool.query(
        `SELECT COUNT(*) AS total FROM ${table} kc JOIN kv_crossroads kr ON kc.crossroad_id = kr.id;`,
        (err, r) => {
          req.pgPool.end();
          if (err) console.log("Could not get total count");
          return res.send({
            status: 200,
            data: result.rows,
            props: r ? r.rows[0] : -1,
          });
        }
      );
    }
  );
});

router.post("/", (req, res) => {
  const { error, value } = schema.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  req.pgPool.query(
    `INSERT INTO 
        ${table} (title, crossroad_id, ip_address)
    VALUES
      ($1, $2, $3) 
    ON CONFLICT ON CONSTRAINT kv_cctv_cameras_ip_address_key DO NOTHING`,
    [value.name, value.key, value.ip_address],
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "CCTV created" });
    }
  );
});

router.put("/", (req, res) => {
  const schema = Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required(),
    key: Joi.number().required(),
    ip_address: Joi.string().required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  req.pgPool.query(
    `UPDATE 
        ${table} 
    SET 
        title = $1, crossroad_id = $2, ip_address = $3 WHERE id = $4`,
    [value.name, value.key, value.ip_address, value.id],
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "CCTV updated" });
    }
  );
});

router.delete("/:id", (req, res) => {
  req.pgPool.query(
    `DELETE FROM ${table} WHERE id = ${req.params.id}`,
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "CCTV deleted" });
    }
  );
});

module.exports = router;
