const { Pool } = require("pg");
const { DB: config } = require("../../../config/index");
const fs = require("fs");

class cleanVideos {
  constructor() {
    this.pool = new Pool(config);
  }

  unlinkVideos() {
    fs.readdir("./models/kvlite/util/video/", (err, files) => {
      if (err) return console.log(err);
      const today = Date.now();
      files.forEach((file) => {
        const { birthtimeMs } = fs.statSync(
          "./models/kvlite/util/video/" + file
        );
        if (today - birthtimeMs >= 86400000) {
          fs.unlinkSync("./models/kvlite/util/video/" + file);
        }
      });
    });
  }
}

module.exports = cleanVideos;
