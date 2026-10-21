const fs=require("fs");fs.writeFileSync(process.env.OUT, Buffer.from(process.argv[2] ?? "", "utf8"));
