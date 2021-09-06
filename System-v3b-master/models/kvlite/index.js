const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");
const img2Video = require("./util/img2video");
const fs = require("fs");
const table = "kv_events";

const schema = Joi.object({
  from_date: Joi.string().required(),
  to_date: Joi.string().required(),

  car_number: Joi.array().items(Joi.string()),
  camera_id: Joi.array().items(Joi.string()),
  computer_id: Joi.array().items(Joi.string()),
  crossroads_id: Joi.array().items(Joi.string()),
  rules: Joi.array().items(Joi.string()),
  models: Joi.array().items(Joi.string()),
  countries: Joi.array().items(Joi.string()),
  colors: Joi.array().items(Joi.string()),

  lines: Joi.array().items(Joi.string()),
  qoida_buzarlik: Joi.boolean().default(false),
  is_passive: Joi.boolean().default(false),
  is_active: Joi.boolean().default(false),

  limit: Joi.number().default(10),
  offset: Joi.number().default(0),
  filter: Joi.string(),
});

//sts 1 yo'q bo'sa rule

//  all request starts with /kvlite

/* Converts images to video and return path to the file */
router.get("/img2video", (req, res) => {
  const img2video = new img2Video();
  img2video.convert(req, res);
});

/* Sends video in the path if exists */
router.get("/download", (req, res) => {
  if (!req.query.path) return res.send({ status: 400, message: "Bad request" });
  const file = `${req.query.path}`;
  if (fs.existsSync(file)) {
    res.download(file);
  } else {
    res.sendStatus(404);
  }
});

/* Serves video for the given event */
router.get("/video", (req, res) => {
  const { query } = req;
  if (!query.the_date || !query.camera_id) return res.send({ status: 400, message: "Bad request" });

  req.pgPool.query(
    `SELECT 
      (video).has_violation, (video).status, (video).frame.stamp AS time, encode(kv_crop_image(kv_restore_image((video).frame), (video).frame.car_coor, false), 'base64') AS image 
    FROM 
      (SELECT unnest(video) AS video FROM kv_events WHERE camera_id = ${query.camera_id} AND the_date = '${query.the_date}' AND video IS NOT NULL) t1`,
    (err, result) => {
      req.pgPool.end();
      if (err)
        return res.send({
          status: 500,
          message: "Internal server error",
          err,
        });
      else res.send({ status: 200, data: result.rows });
    }
  );
});

/* Returns available photos (url) */
router.get("/details", (req, res) => {
  const schema = Joi.object({
    camera_id: Joi.number().required(),
    urlpart: Joi.string().required(),
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
      ARRAY_LENGTH(video, 1) AS videos, ARRAY_LENGTH(photos, 1) AS photos, the_date::text, camera_id
    FROM
      ${table}
    WHERE 
      the_date = '${value.urlpart}' AND camera_id = ${value.camera_id} 
    LIMIT 1`,
    (err, result) => {
      req.pgPool.end();
      if (err) return res.send({ status: 500, message: "Internal Server Error" });
      if (result.rowCount > 0) {
        let imgSrc = [];
        let tmp = result.rows[0];

        let client_ip = req.connection.remoteAddress;
        let host = req.get("host");
        if (client_ip == "192.168.100.235") {
          req.protocol = "https";
          host = "lk.fizmasoft.uz/api";
        }

        imgSrc.push(`${req.protocol + "://" + host}/image?d=${encodeURIComponent(tmp.the_date)}&c_id=${value.camera_id}&p_id=${1}&t=all&c=photos`);
        tmp.videos = tmp.videos > 4 ? 4 : tmp.videos;
        for (let index = 1; index <= tmp.videos; index++) imgSrc.push(`${req.protocol + "://" + host}/image?d=${encodeURIComponent(tmp.the_date)}&c_id=${value.camera_id}&p_id=${index}&t=all&c=video`);

        result.rows[0].src = imgSrc;
        return res.send({ status: 200, data: result.rows[0] });
      } else {
        return res.send({ status: 404, message: "No data" });
      }
    }
  );
});

/*  */
router.get("/", (req, res) => {
  const { error, value } = schema.validate(req.query);

  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  console.log(`SELECT 
        kes.id AS key, car_number, to_char(the_date, 'YYYY-MM-DD HH24:MI:SS') AS the_date, the_date::text AS urlpart, camera_id,  cam.title AS camera, kr.title AS rules, 
        COALESCE(kes.args->'car'->>'color', 'Бошқа') AS color, COALESCE(kes.args->'car'->>'model', 'Бошқа') AS model, COALESCE(kes.args->>'country', 'Бошқа') country
    FROM
        ${table} kes
    ${getJoins()}
    ${getWhere(value, req.user)}
    ${value.filter ? getFilter(value.filter) : ""}
    ORDER BY
        the_date DESC
    LIMIT 
        ${value.limit} 
    OFFSET 
        ${value.offset}`);
  req.pgPool.query(
    `SELECT 
        kes.id AS key, car_number, to_char(the_date, 'YYYY-MM-DD HH24:MI:SS') AS the_date, the_date::text AS urlpart, camera_id,  cam.title AS camera, kr.title AS rules, 
        COALESCE(kes.args->'car'->>'color', 'Бошқа') AS color, COALESCE(kes.args->'car'->>'model', 'Бошқа') AS model, COALESCE(kes.args->>'country', 'Бошқа') country
    FROM
        ${table} kes
    ${getJoins()}
    ${getWhere(value, req.user)}
    ${value.filter ? getFilter(value.filter) : ""}
    ORDER BY
        the_date DESC
    LIMIT 
        ${value.limit} 
    OFFSET 
        ${value.offset}`,
    (error, results) => {
      if (error) {
        req.pgPool.end();
        return res.send({ status: 500, message: "Internal server error" });
      }

      req.pgPool.query(
        `SELECT 
          COUNT(kes.id) AS total, ARRAY_AGG(DISTINCT COALESCE(kes.args->'car'->>'color','Бошқа')) colors, 
          ARRAY_AGG(DISTINCT COALESCE(kes.args->'car'->>'model','Бошқа')) models, ARRAY_AGG(DISTINCT COALESCE(kes.args->>'country', 'Бошқа')) countries  
        FROM ${table} kes ${getJoins()} ${getWhere(value, req.user)}`,
        (err, re) => {
          req.pgPool.end();
          if (err) console.log("Could not get total count");
          res.send({
            status: 200,
            data: results.rows,
            props: re
              ? {
                  total: re.rows[0] ? re.rows[0].total : -1,
                  colors: re.rows[0] ? re.rows[0].colors : [],
                  models: re.rows[0] ? re.rows[0].models : [],
                  countries: re.rows[0] ? re.rows[0].countries : [],
                }
              : {},
          });
        }
      );
    }
  );
});

const getJoins = () => {
  return `JOIN 
            kv_cameras cam ON cam.id = kes.camera_id
        JOIN
            kv_computers com ON com.id = cam.computer_id
        JOIN
            kv_crossroads cros ON cros.id = com.crossroad_id 
        JOIN 
            kv_rules kr ON kr.id = (kes.args->>'rules')::int`;
};

const getWhere = (params, user) => {
  let where = `WHERE the_date BETWEEN '${params.from_date}' AND '${params.to_date}'`;

  // params.car_number (if more than one should be ', OR |' separated), can contain '_' and/or '*'

  if (params.qoida_buzarlik) where += ` AND (kes.args->>'rules')::int > 0`;
  if (params.is_passive) where += ` AND (kes.respond->>'cause') = 'passive'`;
  if (params.is_active) where += ` AND kes.args->'edited'->>'by' IS NOT NULL AND kes.respond->>'cause' IS NULL`;
  if (user.data[0].group_id != 1) where += ` AND ((kes.respond->'cause') <> '"passive"' OR kes.respond->'cause' IS NULL)`;

  if (params.car_number) {
    params.car_number = params.car_number.toString().toUpperCase();
    params.car_number = params.car_number.split("*").join("%");
    params.car_number = params.car_number.split(",").join("|");
    where += ` AND car_number SIMILAR TO '%(${params.car_number})%'`;
  }

  if (params.camera_id) where += ` AND cam.id IN (${params.camera_id})`;

  if (params.computer_id) where += ` AND com.id IN (${params.computer_id})`;

  if (params.crossroads_id) where += ` AND cros.id IN (${params.crossroads_id})`;

  if (params.rules) {
    where += ` AND kr.id IN (${params.rules})`;
    /* if (params.rules.includes("0") === false) {
      where += ` AND sts <> 2`;
    } */
  }

  if (params.models) where += ` AND kes.args->'car'->>'model' IN ('${params.models.join("','")}')`;

  if (params.colors) where += ` AND kes.args->'car'->>'color' IN ('${params.colors.join("','")}')`;

  if (params.countries) where += ` AND kes.args->>'country' IN ('${params.countries.join("','")}')`;
  return where;
};

const getFilter = (filter) => {
  return ` AND (
        UPPER(kes.args->'car'->>'color') SIMILAR TO UPPER('${filter}') OR
        UPPER(kes.args->'car'->>'model') SIMILAR TO UPPER('${filter}') OR
        UPPER(kes.args->>'country') SIMILAR TO UPPER('${filter}')
    )`;
};

module.exports = router;
