const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const CONFIG = require("../../config/index");
const Joi = require("@hapi/joi");

const schema = Joi.object({
  ip_address: Joi.string()
    .ip({
      version: ["ipv4"],
    })
    .required(),
});

//All requests with /maintenance/health

// Botir aka ishlatyapti
router.get("/", (req, res) => {
  const { error, value } = schema.validate(req.query);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  const pool = new Pool(CONFIG.DB);

  pool.query(
    `SELECT * FROM kv_diagnostics_crossroads('${value.ip_address}');`,
    (err, result) => {
      pool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error" });
      res.send({ status: 200, data: result.rows });
    }
  );
});

router.get("/cross", (req, res) => {
  const pool = new Pool(CONFIG.DB);
  pool.query(
    `	WITH 
    kvc as (
      SELECT 
        crossroad_id,
        COUNT(*) FILTER (WHERE last_update::boolean) as actives, 
        COUNT(*) FILTER (WHERE NOT last_update::boolean) as disactives 
      FROM 
        kv_computers
      GROUP BY 
        crossroad_id
    ),
    kv as (
      SELECT 
        crossroad_id,
        COUNT(kv_cameras.*) FILTER (WHERE kv_cameras.last_update::boolean) as actives, 
        COUNT(kv_cameras.*) FILTER (WHERE NOT kv_cameras.last_update::boolean) as disactives 
      FROM 
        kv_computers
      JOIN
        kv_cameras ON kv_computers.id = kv_cameras.computer_id
      GROUP BY
        crossroad_id
    ),
    cctv as (
      SELECT 
        crossroad_id,
        COUNT(*) FILTER (WHERE last_update::boolean) as actives, 
        COUNT(*) FILTER (WHERE NOT last_update::boolean) as disactives 
      FROM 
        kv_cctv_cameras
      GROUP BY 
        crossroad_id
    )
  SELECT 
    split_part(host(cr.ip_address), '.', 3)::int as id, cr.title, cr.ip_address,
    json_build_object('actives', COALESCE(kv.actives, 0), 'disactives', COALESCE(kv.disactives, 0)) as kv_cameras,
    json_build_object('actives', COALESCE(kvc.actives, 0), 'disactives', COALESCE(kvc.disactives, 0)) as kv_computers,
    json_build_object('actives', COALESCE(cctv.actives, 0), 'disactives', COALESCE(cctv.disactives, 0)) as cctv_cameras
  FROM 
    kv_crossroads cr 
  LEFT OUTER JOIN 
    kvc ON kvc.crossroad_id = cr.id
  LEFT OUTER JOIN 
    kv ON kv.crossroad_id = cr.id
  LEFT OUTER JOIN 
    cctv ON cctv.crossroad_id = cr.id
  ORDER BY
    cr.ip_address ASC;`,
    (err, result) => {
      pool.end();
      if (err)
        return res.send({ status: 500, message: "Internal server error", err });
      if (result.rowCount > 0)
        return res.send({ status: 200, data: result.rows });
      return res.send({ status: 404, message: "Data not found" });
    }
  );
});

module.exports = router;
