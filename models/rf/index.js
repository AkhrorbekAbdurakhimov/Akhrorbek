const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");
const moment = require("moment");

const http = require("http");
const fs = require("fs");

const CONFIG = require("../../config/index");

const table = "kv_events_wait";
let respond = "NULL";
// sts = 1 => kv_events_ready, 2 => kv_events_sent
let sts = 1;

const schema = Joi.object({
  car_number: Joi.string().required(),
  the_date: Joi.string().required(),
  camera_id: Joi.number().required(),
  is_passive: Joi.boolean().default(false),
  rule: Joi.number().required(),
  main_photo: Joi.number(),
  model: Joi.string().default("АНИҚЛАНМАДИ").allow(""),
  color: Joi.string().default("АНИҚЛАНМАДИ").allow(""),
  owner: Joi.string().default("АНИҚЛАНМАДИ").allow(""),
  kuzov: Joi.string().default("АНИҚЛАНМАДИ").allow(""),
  shassi: Joi.string().default("АНИҚЛАНМАДИ").allow(""),
  year: Joi.string().default("АНИҚЛАНМАДИ").allow(""),
});

//  all request starts with /rf

router.get("/count", async (req, res) => {
  try {
    let waiting = await req.pgPool.query(`SELECT COUNT(*) AS count FROM ${table} w WHERE (w.args->>'rules')::int <> 2`);

    let skipped = await req.pgPool.query(`SELECT COUNT(*) AS count FROM kv_events_skipped;`);

    res.send({
      status: 200,
      count: waiting.rowCount > 0 ? waiting.rows[0].count : 0,
      skipped_count: skipped.rows[0].count,
    });
  } catch (error) {
    res.send({ status: 500, message: "Internal server error" });
  } finally {
    req.pgPool.end();
  }
});

router.post("/", async (req, res) => {
  const { error, value } = schema.validate(req.body);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  const result = await req.pgPool.query(
    `
      SELECT
      id
      FROM 
      kv_events 
    WHERE 
    car_number = $1 AND args->>'rules' = $2 AND sts IN (1, 2) AND respond->>'cause' is null
    AND 
    the_date BETWEEN '${moment(value.the_date).startOf("day").format("YYYY-MM-DD HH:mm:ss")}' AND $3
    `,
    [value.car_number, "5", value.the_date]
  );

  if (value.is_passive || result.rowCount > 0) {
    respond = value.is_passive ? `jsonb_build_object('cause', 'passive')` : "`jsonb_build_object('cause', 'duplicate')`";
    sts = 2;
  } else {
    sts = 1;
    respond = "NULL";
  }

  value.color = value.color.split("'").join("''");
  value.model = value.model.split("'").join("''");
  value.owner = value.owner.split("'").join("''");
  value.kuzov = value.kuzov.split("'").join("''");
  value.shassi = value.shassi.split("'").join("''");

  let args = `jsonb_build_object('rules', ${value.rule}, 'edited', jsonb_build_object('by', ${req.user.data[0].id}, 'time', NOW()), 'car', 
              jsonb_build_object('color', '${value.color}', 'model', '${value.model}', 'owner', '${value.owner}', 'kuzov', '${value.kuzov}', 'shassi', 
              '${value.shassi}', 'year', '${value.year}'))`;

  let mPhoto = value.main_photo ? `, photos[1] = video[${value.main_photo}].frame` : "";

  req.pgPool.query(
    `UPDATE 
      kv_events 
    SET 
      car_number = '${value.car_number.toUpperCase()}', args = (args || ${args}), sts = ${sts}, respond = ${respond} ${mPhoto}
    WHERE 
      the_date = '${value.the_date}' AND camera_id = ${value.camera_id};DELETE FROM kv_session WHERE token = MD5('${req.headers.token}');`,
    (error) => {
      req.pgPool.end();
      if (error)
        return res.send({
          status: 500,
          message: "Internal Server error",
          error,
        });
      return res.send({ status: 200, message: "Data saved" });
    }
  );
});

/* Move cars to skipped table */
router.post("/skip", (req, res) => {
  const schema = Joi.object({
    camera_id: Joi.number().required(),
    the_date: Joi.string().required(),
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
      kv_events SET sts = 3
    WHERE 
      the_date = '${value.the_date}' AND camera_id = ${value.camera_id};DELETE FROM kv_session WHERE token = MD5('${req.headers.token}');`,
    (err) => {
      req.pgPool.end();
      if (err)
        return res.send({
          status: 500,
          message: "Internal Server error",
          err,
        });
      return res.send({ status: 200, message: "Data skipped" });
    }
  );
});

/* Get skipped cars list : NOT USED*/
router.get("/skippedlist", (req, res) => {
  const schema = Joi.object({
    limit: Joi.number().optional().default(10),
    offset: Joi.number().optional().default(0),
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
      id, car_number, (args->>'rules')::int AS rules, the_date::text as the_date, camera_id, 'skipped' as t FROM kv_events_skipped
    LIMIT $1 OFFSET $2;`,
    [value.limit, value.offset],
    (err, r) => {
      if (err) return res.send({ status: 500, message: "Internal error" });

      req.pgPool.query(`SELECT COUNT(*) as count FROM kv_events_skipped`, (error, response) => {
        if (error) return res.send({ status: 500, message: "Internal error" });
        return res.send({ status: 200, data: r.rows, count: response.rows[0].count });
      });
    }
  );
});

/* Gets available event from skipped to recognition fixer */
router.get("/skipped", (req, res) => {
  const schema = Joi.object({
    the_date: Joi.string().required(),
    camera_id: Joi.number().required(),
    t: Joi.string().valid("wait", "skipped").required(),
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
        w.id, car_number, (w.args->>'rules')::int AS rules, to_char(the_date, 'YYYY-MM-DD HH24:MI:SS') AS the_date, camera_id, the_date::text AS urlpart, 
        ARRAY_LENGTH(photos, 1) AS photos, kr.title, ARRAY_LENGTH(video, 1) AS videos, cam.title AS c_name, com.title as computer_name,
		    cros.title AS cross_name,  
        (SELECT ARRAY_AGG(((a.videos::kv_frame).frame::kv_bytea).stamp) AS stamps FROM (SELECT unnest(video) AS videos) a), 
        (SELECT ARRAY_AGG((a.photos::kv_bytea).stamp) AS main FROM (SELECT unnest(photos) AS photos) a), 
        (SELECT ARRAY_AGG((a.photos::kv_bytea).car_coor) AS car_coors FROM (SELECT unnest(photos) AS photos) a),
        w.args->'speed'->>'limit' AS s_limit, w.args->'speed'->>'current' AS s_current 
    FROM
        kv_events_${value.t} w
    JOIN 
        kv_rules kr ON (w.args->>'rules')::int = kr.id
    JOIN 
        kv_cameras cam ON w.camera_id = cam.id
    JOIN 
		    kv_computers com ON cam.computer_id = com.id
	  JOIN 
		    kv_crossroads cros ON com.crossroad_id = cros.id
    WHERE  
        w.the_date = $1 AND w.camera_id = $2;`,
    [value.the_date, value.camera_id],
    async (error, results) => {
      if (error)
        return res.send({
          status: 500,
          message: "Internal server error",
          error,
        });

      if (results.rowCount > 0) {
        let imgSrc = [];
        let tmp = results.rows[0];

        let client_ip = req.connection.remoteAddress;
        let host = req.get("host");
        if (client_ip == "192.168.100.235") {
          req.protocol = "https";
          host = "lk.fizmasoft.uz/api";
        }

        // populate image url
        imgSrc.push(`${req.protocol + "://" + host}/image?d=${encodeURIComponent(tmp.urlpart)}&c_id=${tmp.camera_id}&p_id=${1}&t=${value.t}&c=photos`);

        tmp.videos = tmp.videos > 4 ? 4 : tmp.videos;
        for (let index = 1; index <= tmp.videos; index++)
          imgSrc.push(`${req.protocol + "://" + host}/image?d=${encodeURIComponent(tmp.urlpart)}&c_id=${tmp.camera_id}&p_id=${index}&t=${value.t}&c=video`);

        results.rows[0].src = imgSrc;
        await req.pgPool.query(`
            INSERT INTO 
                kv_session (token, event_id, the_date)
            VALUES 
                (MD5('${req.headers.token}'), ${results.rows[0].id}, '${results.rows[0].the_date}') 
            ON CONFLICT ON CONSTRAINT 
                kv_session_pkey 
            DO UPDATE SET 
                the_date = '${results.rows[0].the_date}', event_id = ${results.rows[0].id}, last_seen = NOW();`);
        req.pgPool.end();
        return res.send({ status: 200, data: results.rows[0] });
      } else {
        req.pgPool.end();
        return res.send({ status: 404, message: "No data" });
      }
    }
  );
});

/* Gets available event to recognition fixer */
router.get("/", (req, res) => {
  req.pgPool.query(
    `SELECT 
        w.id, w.sts,  car_number, (w.args->>'rules')::int AS rules, to_char(the_date, 'YYYY-MM-DD HH24:MI:SS') AS the_date, camera_id, the_date::text AS urlpart, 
        ARRAY_LENGTH(photos, 1) AS photos, kr.title, ARRAY_LENGTH(video, 1) AS videos, cam.title AS c_name, com.title as computer_name,
		    cros.title AS cross_name, 
        (SELECT ARRAY_AGG(((a.videos::kv_frame).frame::kv_bytea).stamp) AS stamps FROM (SELECT unnest(video) AS videos) a), 
        (SELECT ARRAY_AGG((a.photos::kv_bytea).stamp) AS main FROM (SELECT unnest(photos) AS photos) a), 
        (SELECT ARRAY_AGG((a.photos::kv_bytea).car_coor) AS car_coors FROM (SELECT unnest(photos) AS photos) a),
        w.args->'speed'->>'limit' AS s_limit, w.args->'speed'->>'current' AS s_current 
    FROM
        kv_events w
    JOIN 
        kv_rules kr ON (w.args->>'rules')::int = kr.id
    JOIN 
        kv_cameras cam ON w.camera_id = cam.id
    JOIN 
		    kv_computers com ON cam.computer_id = com.id
	  JOIN 
		    kv_crossroads cros ON com.crossroad_id = cros.id
    WHERE  
        w.id NOT IN (SELECT event_id FROM kv_session WHERE token <> MD5('${req.headers.token}')) AND (w.args->>'rules')::int <> 2 AND w.sts IN (0, 3)
    FETCH FIRST ROW ONLY;`,
    async (error, results) => {
      if (error)
        return res.send({
          status: 500,
          message: "Internal server error",
          error,
        });

      if (results.rowCount > 0) {
        let imgSrc = [];
        let tmp = results.rows[0];

        let client_ip = req.connection.remoteAddress;
        let host = req.get("host");
        if (client_ip == "192.168.100.235") {
          req.protocol = "https";
          host = "lk.fizmasoft.uz/api";
        }
        let partition = results.rows[0].sts == 0 ? "wait" : "skipped";

        // populate image url
        imgSrc.push(`${req.protocol + "://" + host}/image?d=${encodeURIComponent(tmp.urlpart)}&c_id=${tmp.camera_id}&p_id=${1}&t=${partition}&c=photos`);

        tmp.videos = tmp.videos > 4 ? 4 : tmp.videos;
        for (let index = 1; index <= tmp.videos; index++)
          imgSrc.push(`${req.protocol + "://" + host}/image?d=${encodeURIComponent(tmp.urlpart)}&c_id=${tmp.camera_id}&p_id=${index}&t=${partition}&c=video`);

        results.rows[0].src = imgSrc;
        await req.pgPool.query(`
            INSERT INTO 
                kv_session (token, event_id, the_date)
            VALUES 
                (MD5('${req.headers.token}'), ${results.rows[0].id}, '${results.rows[0].the_date}') 
            ON CONFLICT ON CONSTRAINT 
                kv_session_pkey 
            DO UPDATE SET 
                the_date = '${results.rows[0].the_date}', event_id = ${results.rows[0].id}, last_seen = NOW();`);
        req.pgPool.end();
        return res.send({ status: 200, data: results.rows[0] });
      } else {
        req.pgPool.end();
        return res.send({ status: 404, message: "No data" });
      }
    }
  );
});

router.get("/details", (req, result) => {
  const schema = Joi.object({
    car_number: Joi.string().required(),
    token: Joi.string(),
  });

  const { error, value } = schema.validate(req.query);
  if (error)
    return result.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  try {
    value.token = JSON.parse(fs.readFileSync("./files/token.txt", "utf-8"));
  } catch (error) {
    console.log("Could not find token");
    return result.send({ status: 500, message: "Could not find token" });
  }

  const data = JSON.stringify({
    pPlateNumber: value.car_number.toUpperCase(),
  });

  const options = {
    hostname: CONFIG.API_URL,
    port: CONFIG.API_PORT,
    path: "/Violations/api/GetVehicleFull",
    method: "POST",
    headers: {
      Authorization: `Bearer ${value.token.access_token}`,
      "Content-Type": "application/json",
      "Content-Length": data.length,
    },
  };
  console.log("here");
  const request = http.request(options, (res) => {
    if (res.statusCode === 200) {
      res.on("data", (d) => {
        let data = JSON.parse(d.toString("utf-8"));
        if (data.pAnswereCode == 1 && data.pComment == "OK") {
          return result.send({ status: 200, vehicle: data.Vehicle });
        } else {
          return result.send({ status: 404, message: "No info" });
        }
      });
    }
  });

  request.setTimeout(5 * 1000, () => {
    console.log("Timedout");
    return result.send({ status: 404, message: "Timed out" });
  });

  request.on("error", (error) => {
    console.log(error);
    console.log("Error");
    return result.send({ satus: 500, message: "Could not get car details" });
  });

  request.write(data);
  request.end();
});

/* Get All cars list  kv_events_wait and kv_events_skipped*/
router.get("/list", (req, res) => {
  const schema = Joi.object({
    car_number: Joi.string().allow("").required(),
    limit: Joi.number().optional().default(10),
    offset: Joi.number().optional().default(0),
    isSkipped: Joi.boolean().required(),
  });
  const { error, value } = schema.validate(req.query);
  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });
  let sts = "sts IN " + (value.isSkipped ? "(3)" : "(0,3)");
  let filter = value.car_number !== "" ? ` AND UPPER(car_number) LIKE UPPER('%${value.car_number.trim()}%')` : "";

  req.pgPool.query(
    `SELECT 
      id, car_number, (args->>'rules')::int AS rules, the_date::text as the_date, camera_id,
    (CASE when sts = 0 then 'wait' when sts = 3 then 'skipped' END) as t
      FROM 
    kv_events
      WHERE 
   ${sts}  ${filter}
      ORDER BY 
    the_date ASC
      LIMIT $1 OFFSET $2;`,
    [value.limit, value.offset],
    (err, r) => {
      if (err) return res.send({ status: 500, message: "Internal error" });

      req.pgPool.query(
        `SELECT 
          COUNT(*)
        FROM 
          kv_events
        WHERE 
          ${sts} ${filter}`,
        (error, response) => {
          if (error) return res.send({ status: 500, message: "Internal error" });
          return res.send({ status: 200, data: r.rows, count: response.rows[0].count });
        }
      );
    }
  );
});

module.exports = router;
