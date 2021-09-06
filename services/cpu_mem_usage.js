const os = require("os");
const fs = require("fs");
const { exec } = require("child_process");

const cpuAverage = () => {
  let totalIdle = 0;
  let totalTick = 0;
  let cpus = os.cpus();
  for (let i = 0, len = cpus.length; i < len; i++) {
    let cpu = cpus[i];
    for (type in cpu.times) totalTick += cpu.times[type];
    totalIdle += cpu.times.idle;
  }

  return { idle: totalIdle / cpus.length, total: totalTick / cpus.length };
};

let startMeasure = cpuAverage();

/* setInterval(() => {
  let percentageCPU = mesure(startMeasure);

  let date = new Date();
  let formatted = `${date.getFullYear()}/${
    date.getMonth() + 1
  }/${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;

  fs.appendFileSync("cpu.csv", `${percentageCPU}%, ${formatted},\n`);
}, 2000); */

const mesure = (startMeasure) => {
  let endMeasure = cpuAverage();
  let idleDifference = endMeasure.idle - startMeasure.idle;
  let totalDifference = endMeasure.total - startMeasure.total;
  let percentageCPU = 100 - ~~((100 * idleDifference) / totalDifference);

  startMeasure = cpuAverage();
  return percentageCPU;
};

module.exports.cpuUsage = async (cb) => {
  let startMeasure = cpuAverage();
  setTimeout(() => {
    cb(mesure(startMeasure));
  }, 1000);
};

module.exports.memUsage = async (cb) => {
  if (os.platform() === "win32") {
    cb({ totalMem: os.totalmem(), freeMem: os.freemem() });
  } else {
    exec(
      `awk '/MemAvailable:/ {print $2}' /proc/meminfo`,
      (err, stdout, stderr) => {
        if (err) {
          cb({ totalMem: os.totalmem(), freeMem: os.freemem() });
        } else {
          cb({ totalMem: os.totalmem(), freeMem: stdout * 1024 });
        }
      }
    );
  }
};
