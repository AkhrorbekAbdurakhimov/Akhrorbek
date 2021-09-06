const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const { DB } = require("../../config/index");
const Joi = require("@hapi/joi");

const helperSchema = Joi.alternatives()
  .try(Joi.array().items(Joi.number().min(0).required()), Joi.number().min(0).required())
  .optional()
  .default(null);

const crossActionSchema = Joi.object({
  action: Joi.string().valid("stop", "start").required(),
  start_time: Joi.string().required(),
  end_time: Joi.string().required(),
  crossroad_ids: helperSchema,
  computer_ids: helperSchema,
  camera_ids: helperSchema,
});

const logSchema = Joi.object({
  id: Joi.number().required(),
  type: Joi.string().valid("cross", "comps", "cams"),
  offset: Joi.number().optional().default(0),
  limit: Joi.number().optional().default(15),
});

// all request start from /conf/kvlite

router.post("/log", async (req, res) => {
  let column = "",
    rows,
    countRes;
  const { error, value } = logSchema.validate(req.body);
  if (error) return res.send({ status: 400, message: "Bad request" });
  const { id, type, offset, limit } = value;
  if (type === "cross") column = "crossroad_id";
  else if (type === "comps") column = "computer_id";
  else column = "camera_id";

  let query = `
              SELECT kv_conf.id, kv_conf.command->'query' as command, kv_conf.the_date, kv_conf.is_notified, kv_conf.is_confirmed, kv_us.full_name as created_user, 
                kv_cross.title as crossroad_title, kv_comp.title as computer_title, kv_cam.title as camera_title
                FROM kv_configure as kv_conf
              JOIN 
                kv_crossroads as kv_cross
              ON 
                kv_conf.crossroad_id = kv_cross.id
              JOIN
                kv_computers as kv_comp
              ON
                kv_conf.computer_id = kv_comp.id
              JOIN 
                kv_cameras as kv_cam
              ON
                kv_conf.camera_id = kv_cam.id
              JOIN
                kv_users as kv_us
              ON 
                kv_conf.created_user_id = kv_us.id
              WHERE
                kv_conf.${column} = $1 ORDER by kv_conf.the_date DESC OFFSET ${offset} LIMIT ${limit}`;
  let countQuery = `SELECT COUNT(*) as count  FROM kv_configure as kv_conf WHERE kv_conf.${column} = $1`;
  const pool = new Pool(DB);
  pool.query(query, [id], async (err, result) => {
    if (err) return res.send({ status: 500, message: "Internal server error" });
    rows = result.rows;

    try {
      for (let i = 0; i < rows.length; i++) {
        let jsonb = getJsonBuild(rows[i].command);
        let command = await pool.query(`SELECT ${jsonb}`);
        rows[i].command = command.rows[0].jsonb_build_object.rules;
      }

      countRes = await pool.query(countQuery, [id]);
    } catch (error) {
      console.log(error);
      return res.send({ status: 500, message: "Internal server error" });
    }
    return res.send({ status: 200, data: rows, count: countRes.rows[0].count });
  });
});

router.post("/:action", async (req, res) => {
  const user_id = Number(req.user.data[0].id);
  req.body.action = req.params.action;
  const { value, error } = crossActionSchema.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      err: error.details[0].message,
    });

  let command = `UPDATE cameras SET args = args || jsonb_build_object("rules", jsonb_build_object("start", "${value.start_time}", "end", "${value.end_time}", "status", ${value.action == "start"}))`;

  const pool = new Pool(DB);

  if (value.camera_ids) {
    if (Array.isArray(value.crossroad_ids) || Array.isArray(value.computer_ids)) {
      pool.end();
      return res.send({
        status: 400,
        message: "When 'camera_ids' is set 'crossroad_ids' and 'computer_ids' should not be array",
      });
    }
    if (!value.computer_ids) {
      pool.end();
      return res.send({
        status: 400,
        message: "When 'camera_ids' is set 'computer_ids' is required",
      });
    }
    if (!Array.isArray(value.camera_ids)) value.camera_ids = [value.camera_ids];
    for (const camera_id of value.camera_ids) {
      try {
        const result = await pool.query(`SELECT ip_address FROM kv_cameras WHERE id = ${camera_id} LIMIT 1`);
        let where = ` WHERE ip_address = "${result.rows[0].ip_address}"`;

        await pool.query(
          `INSERT INTO kv_configure (command, crossroad_id, computer_id, camera_id, created_user_id) VALUES (jsonb_build_object('query','${command + where}'), 
          ${value.crossroad_ids}, ${value.computer_ids}, ${camera_id}, ${user_id});`
        );
      } catch (error) {
        console.log(error.message);
        pool.end();
        return res.send({ status: 500, message: "Server error" });
      }
    }
  } else if (value.computer_ids) {
    if (Array.isArray(value.crossroad_ids)) {
      pool.end();
      return res.send({
        status: 400,
        message: "When 'computer_ids' is set crossroad_ids should not be array",
      });
    }
    if (!Array.isArray(value.computer_ids)) value.computer_ids = [value.computer_ids];
    for (const computer_id of value.computer_ids) {
      try {
        let _cameras = await pool.query(`SELECT id FROM kv_cameras WHERE computer_id = ${computer_id}`);
        for (const camera of _cameras.rows) {
          const result = await pool.query(`SELECT ip_address FROM kv_cameras WHERE id = ${camera.id} LIMIT 1`);
          let where = ` WHERE ip_address = "${result.rows[0].ip_address}"`;

          await pool.query(
            `INSERT INTO kv_configure (command, crossroad_id, computer_id, camera_id, created_user_id) VALUES (jsonb_build_object('query','${command + where}'), 
              ${value.crossroad_ids}, ${computer_id}, ${camera.id}, ${user_id});`
          );
        }
      } catch (error) {
        console.log(error.message);
        pool.end();
        return res.send({ status: 500, message: "Server error" });
      }
    }
  } else {
    if (!Array.isArray(value.crossroad_ids)) value.crossroad_ids = [value.crossroad_ids];
    for (const crossroad_id of value.crossroad_ids) {
      try {
        let _computers = await pool.query(`SELECT id FROM kv_computers WHERE crossroad_id = ${crossroad_id}`);
        for (const comp_id of _computers.rows) {
          let _cameras = await pool.query(`SELECT id FROM kv_cameras WHERE computer_id = ${comp_id.id}`);

          for (const camera of _cameras.rows) {
            const result = await pool.query(`SELECT ip_address FROM kv_cameras WHERE id = ${camera.id} LIMIT 1`);
            let where = ` WHERE ip_address = "${result.rows[0].ip_address}";`;

            await pool.query(
              `INSERT INTO kv_configure (command, crossroad_id, computer_id, camera_id, created_user_id) VALUES (jsonb_build_object('query','${command + where}'), 
              ${crossroad_id}, ${comp_id.id}, ${camera.id}, ${user_id});`
            );
          }
        }
      } catch (error) {
        console.log(error.message);
        pool.end();
        return res.send({ status: 500, message: "Server error" });
      }
    }
  }

  pool.end();
  return res.send({ status: 200, message: "Configuration set" });
});

router.get("/cross", (req, res) => {
  const schema = Joi.object({
    limit: Joi.number().min(0).default(10),
    offset: Joi.number().min(0).default(0),
  });
  const { value, error } = schema.validate(req.query);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });
  const pool = new Pool(DB);
  pool.query(
    `SELECT 
      r.id, r.title, count(c.id) as all_count,  COUNT(c.id) FILTER (WHERE  c.args->>'status' = 'true') AS working,
    COUNT(c.id) FILTER (WHERE  c.args->>'status' = 'false' or c.args->>'status' is null  ) AS not_working
      FROM 
    kv_crossroads as r  
      JOIN
    kv_computers as k ON r.id = k.crossroad_id
      JOIN
    kv_cameras c ON c.computer_id = k.id
      GROUP BY
    r.id
    LIMIT 
      $1
    OFFSET
      $2;`,
    [value.limit, value.offset],
    (err, r) => {
      if (err) {
        console.log(err);
        pool.end();
        return res.send({ status: 500, message: "Internla errors" });
      }
      pool.query(
        `SELECT 
          count(DISTINCT c.id) 
        FROM 
          kv_crossroads c
        JOIN
          kv_computers k ON c.id = k.crossroad_id;`,
        (err, c) => {
          pool.end();
          let total = err ? -1 : c.rows[0].count;
          return res.send({ status: 200, data: r.rows, count: total });
        }
      );
    }
  );
});

router.get("/comps", (req, res) => {
  const schema = Joi.object({
    crossroad_id: Joi.number().min(0).required(),
    limit: Joi.number().min(0).default(10),
    offset: Joi.number().min(0).default(0),
  });
  const { value, error } = schema.validate(req.query);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });
  const pool = new Pool(DB);
  pool.query(
    `SELECT 
        comp.id, comp.title, comp.ip_address, comp.last_update, count(cam.id) as all_count,  COUNT(cam.id) FILTER (WHERE  cam.args->>'status' = 'true') AS working,
      COUNT(cam.id) FILTER (WHERE  cam.args->>'status' = 'false' OR cam.args->>'status' is null  ) AS not_working
      FROM 
        kv_computers comp
    JOIN 
      kv_cameras  cam ON cam.computer_id = comp.id 
    WHERE
        crossroad_id = $1
    GROUP BY comp.id

    LIMIT 
      $2
    OFFSET
      $3;`,
    [value.crossroad_id, value.limit, value.offset],
    (err, r) => {
      if (err) {
        console.log(err);
        pool.end();
        return res.send({ status: 500, message: "Internla errors" });
      }
      pool.query(
        `SELECT 
          COUNT(id) AS count 
        FROM 
          kv_computers
        WHERE
          crossroad_id = $1;`,
        [value.crossroad_id],
        (err, c) => {
          pool.end();
          let total = err ? -1 : c.rows[0].count;
          return res.send({ status: 200, data: r.rows, count: total });
        }
      );
    }
  );
});

router.get("/cams", (req, res) => {
  const schema = Joi.object({
    computer_id: Joi.number().min(0).required(),
    limit: Joi.number().min(0).default(10),
    offset: Joi.number().min(0).default(0),
  });
  const { value, error } = schema.validate(req.query);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });
  const pool = new Pool(DB);
  pool.query(
    `SELECT 
      id, title, ip_address, (args->>'status')::boolean as status
    FROM 
      kv_cameras
    WHERE
      computer_id = $1
    LIMIT 
      $2
    OFFSET
      $3;`,
    [value.computer_id, value.limit, value.offset],
    (err, r) => {
      if (err) {
        console.log(err);
        pool.end();
        return res.send({ status: 500, message: "Internal errors" });
      }
      pool.query(
        `SELECT 
          COUNT(id) AS count 
        FROM 
          kv_cameras
        WHERE
          computer_id = $1;`,
        [value.computer_id],
        (err, c) => {
          pool.end();
          let total = err ? -1 : c.rows[0].count;
          return res.send({ status: 200, data: r.rows, count: total });
        }
      );
    }
  );
});

function parseLog(string, pattern) {
  let firstIndex = string.indexOf(pattern);
  string = string.slice(firstIndex);
  string = string.slice(string.indexOf(",") + 1);
  string = string.slice(0, string.indexOf(","));
  return string.replace(/\"/g, "");
}

function getJsonBuild(string) {
  let firstIndex = string.indexOf("jsonb_build_object");
  let secondIndex = string.indexOf("))") + 3;
  string = string.slice(firstIndex, secondIndex - 1);
  string = string.replace(/\"/g, `'`);
  return string;
}

module.exports = router;
