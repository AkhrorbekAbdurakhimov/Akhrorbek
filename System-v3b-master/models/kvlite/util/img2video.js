var exec = require("child_process").exec;
const fs = require("fs");

class img2Video {
  convert(req, res) {
    const { query } = req;
    if (!query.event_id || !query.the_date || !query.camera_id)
      return res.send({ status: 400, message: "Bad request" });
    if (fs.existsSync(`${__dirname}/video/${query.event_id}.mp4`)) {
      res.send({
        status: 200,
        path: `${__dirname}/video/${query.event_id}.mp4`
      });
    } else {
      req.pgPool.query(
        `SELECT 
            encode(kv_crop_image(kv_restore_image((video).frame), (video).frame.car_coor, false), 'base64') AS image 
        FROM 
            (SELECT unnest(video) AS video, id FROM kv_events WHERE camera_id = ${query.camera_id} AND the_date = '${query.the_date}' AND video IS NOT NULL) t1`,
        (error, result) => {
          req.pgPool.end();
          if (!error) {
            result.rows.forEach((element, index, originalArray) => {
              fs.writeFile(
                `${__dirname}/images/${query.event_id}_${index}.jpeg`,
                element.image,
                { encoding: "base64" },
                err => {
                  if (originalArray.length - 1 == index) {
                    var ffmpegPath =
                      process.platform === "win32"
                        ? "win32-x64 && ffmpeg"
                        : "linux-x64 && ./ffmpeg";
                    exec(
                      `cd ./node_modules/@ffmpeg-installer/${ffmpegPath} -i ${__dirname}/images/${query.event_id}_%d.jpeg  -r 25 -an -s 3392x2008 -r 25 -y -vf "setpts=6*PTS"  ${__dirname}/video/${query.event_id}.mp4 -hide_banner`,
                      error => {
                        if (!error) {
                          this.unlinkImages(
                            originalArray.length,
                            query.event_id
                          );
                          res.send({
                            status: 200,
                            path: `${__dirname}/video/${query.event_id}.mp4`
                          });
                        } else {
                          this.unlinkImages(
                            originalArray.length,
                            query.event_id
                          );
                          res.send({ status: 500, error });
                        }
                      }
                    );
                  }
                }
              );
            });
          } else {
            res.send({ status: 500, message: "Internal server error" });
          }
        }
      );
    }
  }

  unlinkImages(count, event_id) {
    for (let index = 0; index < count; index++) {
      fs.unlinkSync(`${__dirname}/images/${event_id}_${index}.jpeg`);
    }
  }
}

module.exports = img2Video;
