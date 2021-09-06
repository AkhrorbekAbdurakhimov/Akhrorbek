const express = require("express");
const router = express.Router();
const Joi = require("@hapi/joi");
const { Pool } = require("pg");
const CONFIG = require("../../config/index");
const pool = new Pool(CONFIG.DB);
const canvas = require("canvas");

const schema = Joi.object({
  d: Joi.string().required(), // date time
  c_id: Joi.number().required(), // camera_id
  p_id: Joi.number().required(), // photo_id
  t: Joi.string().valid("wait", "ready", "sent", "skipped", "all").required(), // table
  p: Joi.string().valid("car", "plate").required(), // plate or car photo
  c: Joi.string().valid("photos", "video").required(), // column
  crop: Joi.boolean().default(true),
});

function drawRect(buffer, options, func) {
  canvas.loadImage(buffer).then((image) => {
    let c = canvas.createCanvas(image.width, image.height);
    let ctx = c.getContext("2d");
    ctx.drawImage(image, 0, 0, image.width, image.height);
    ctx.strokeStyle = options.color;
    ctx.beginPath();
    ctx.lineWidth = options.weight;
    ctx.rect(options.x, options.y, options.width, options.height);
    ctx.stroke();
    func(c.toBuffer("image/jpeg"));
  });
}

//  all request starts with /image
function minimize(car_coor, plate_coor, percent) {
  let old = {
    x: car_coor.x,
    y: car_coor.y,
    w: car_coor.w,
    h: car_coor.h,
  };
  car_coor.w = parseInt(old.w * percent);
  car_coor.h = parseInt(old.h * percent);
  car_coor.x = plate_coor.x + parseInt((plate_coor.w - car_coor.w) / 2);
  car_coor.y = plate_coor.y + parseInt((plate_coor.h - car_coor.h) / 2);

  if (car_coor.x < old.x) car_coor.x = old.x;
  if (car_coor.y < old.y) car_coor.y = old.y;
  let dx = car_coor.x + car_coor.w - (old.x + old.w);
  let dy = car_coor.y + car_coor.h - (old.y + old.h);
  if (dx > 0) {
    car_coor.x -= dx;
  }
  if (dy > 0) {
    car_coor.y -= dy;
  }
  return car_coor;
}

router.get("/", (req, res) => {
  const { error, value } = schema.validate(req.query);

  if (error)
    return res.send({
      status: 400,
      message: "Bad request",
      error: error.details[0].message,
    });

  let query = "";
  value.f = value.c == "video" ? ".frame" : "";
  value.t = value.t == "all" ? "" : `_${value.t}`;

  if (!value.crop) {
    query = `SELECT ${value.c}[${value.p_id}]${value.f}.photo AS photo, ${value.c}[${value.p_id}]${value.f}.car_coor::json, ${value.c}[${value.p_id}]${value.f}.plate_coor::json, args->'rules' as rules FROM kv_events${value.t} WHERE the_date = '${value.d}' AND camera_id = ${value.c_id} LIMIT 1;`;
  } else if (value.p === "plate") {
    query = `SELECT ${value.c}[2].photo as photo FROM kv_events${value.t} WHERE the_date = '${value.d}' AND camera_id = ${value.c_id} LIMIT 1;`;
  } else {
    query = `SELECT 
        kv_crop_image(kv_restore_image(${value.c}[${value.p_id}]${value.f}), ${value.c}[${value.p_id}]${value.f}.${value.p}_coor, ${value.f === ""}) AS photo, ${value.c}[${value.p_id}]${
      value.f
    }.car_coor::json, ${value.c}[${value.p_id}]${value.f}.plate_coor::json
      FROM 
        kv_events${value.t} WHERE the_date = '${value.d}' AND camera_id = ${value.c_id} LIMIT 1;`;
  }
  pool.query(query, (error, results) => {
    if (error) return res.sendStatus(500);
    if (results.rowCount <= 0) return res.sendStatus(404);

    if (results.rowCount > 0) {
      let { photo, car_coor, plate_coor, rules } = results.rows[0];
      res.setHeader("Content-Type", "image/jpeg");
      //return res.send(photo);
      if (!car_coor && !plate_coor) return res.send(photo);

      let options = {
        x: 0,
        y: 0,
        widht: 0,
        height: 0,
        color: "#ffff00",
        weight: 3,
      };

      if (!value.crop) {
        let coors = rules != "5" ? minimize(car_coor, plate_coor, 0.5) : car_coor;
        options.x = parseInt(coors.x);
        options.y = parseInt(coors.y);
        options.width = parseInt(coors.w);
        options.height = parseInt(coors.h);
        options.weight = 5;
      } else {
        options.x = plate_coor.x - car_coor.x;
        options.y = plate_coor.y - car_coor.y;
        options.width = plate_coor.w;
        options.height = plate_coor.h;
      }
      drawRect(photo, options, (buffer) => {
        res.send(buffer);
      });
    }
  });
});

module.exports = router;
