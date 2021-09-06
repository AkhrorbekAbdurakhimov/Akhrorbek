const CONFIG = require("../../config/index");
const { Pool } = require("pg");
const axios = require("axios");
const pool = new Pool(CONFIG.DB);
const crypto = require("crypto");

module.exports = initKvConfig = () => {
  getKvConfig();
  setInterval(() => {
    getKvConfig();
  }, 30000);
};

const encrypt_body = (data) => {
  const cipher = crypto.createCipheriv("aes-256-cbc", CONFIG.AES_KEY, CONFIG.AES_IV);
  return cipher.update(data, "utf8", "base64") + cipher.final("base64");
};

const getKvConfig = async () => {
  try {
    let commands = await pool.query(
      `SELECT 
        kv.id, command, com.ip_address
      FROM 
        kv_configure kv
      JOIN
        kv_computers com ON com.id = kv.computer_id
      WHERE 
        NOT is_notified;`
    );

    if (commands.rowCount == 0) return;

    for (const command of commands.rows) {
      await pool.query(`UPDATE kv_configure SET is_notified = true WHERE id=$1`, [command.id]);
      let cmdString = JSON.stringify(command.command);

      axios
        .post(
          `http://${command.ip_address}:8808/config`,
          {
            command: encrypt_body(cmdString),
            id: command.id,
          },
          { headers: { "Content-Type": "application/json" } }
        )
        .then(({ data }) => {
          if (data.status == 200 && data.id) pool.query(`UPDATE kv_configure SET is_confirmed=true WHERE id=$1`, [data.id]);
        })
        .catch((error) => {
          console.log("Error: 51 ", error.message);
        });
    }
  } catch (error) {
    console.log("Error: 55 ", error.message);
  }
};
