const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");

const schema = Joi.object({
  name: Joi.string().required(),
  ip_address: Joi.string().required(),
  key: Joi.number().required(),
});

//  all request starts with /cameras

router.get("/", (req, res) => {
  if (req.query.computer_id) return getCamerasToKvLite(req, res);
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
      kc.id AS key, kc.title AS name, kc.ip_address, kc.computer_id, to_char(kc.last_update, 'YYYY-MM-DD HH24:MI:SS') AS last_update, kc.args, kvc.title AS c_name 
    FROM 
      kv_cameras kc 
    JOIN 
      kv_computers kvc ON kc.computer_id = kvc.id
    ORDER BY
      kc.title ASC
    LIMIT 
      ${value.limit}
    OFFSET
      ${value.offset};`,
    (err, result) => {
      if (err) {
        req.pgPool.end();
        return res.send({ status: 500, message: "Internal server error" });
      }
      req.pgPool.query(`SELECT COUNT(*) AS total FROM kv_cameras kc JOIN kv_computers kvc ON kc.computer_id = kvc.id;`, (err, r) => {
        req.pgPool.end();
        if (err) console.log("Could not get total count");
        return res.send({
          status: 200,
          data: result.rows,
          props: r ? r.rows[0] : -1,
        });
      });
    }
  );
});

const getCamerasToKvLite = (req, res) => {
  req.pgPool.query(
    `SELECT 
      id AS key, title AS name 
    FROM 
      kv_cameras 
    WHERE 
      computer_id IN (${req.query.computer_id})
    ORDER BY
      title ASC`,
    (err, result) => {
      req.pgPool.end();
      if (err) return res.send({ status: 500, message: "Internal server error" });
      if (result.rowCount > 0) return res.send({ status: 200, data: result.rows });
      return res.send({ status: 404, message: "Computer not found" });
    }
  );
};

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
      kv_cameras (title, computer_id, ip_address)
    VALUES
      ($1, $2, $3)`,
    [value.name, value.key, value.ip_address],
    (err) => {
      req.pgPool.end();
      if (err) return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Camera created" });
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
      kv_cameras 
    SET 
      title = $1, computer_id = $2, ip_address = $3 WHERE id = $4`,
    [value.name, value.key, value.ip_address, value.id],
    (err) => {
      req.pgPool.end();
      if (err) return res.send({ status: 500, message: "Internal server error" });
      return res.send({ status: 200, message: "Camera updated" });
    }
  );
});

router.delete("/:id", (req, res) => {
  req.pgPool.query(`DELETE FROM kv_cameras WHERE id = ${req.params.id}`, (err) => {
    req.pgPool.end();
    if (err) return res.send({ status: 500, message: "Internal server error" });
    return res.send({ status: 200, message: "Camera deleted" });
  });
});

module.exports = router;
