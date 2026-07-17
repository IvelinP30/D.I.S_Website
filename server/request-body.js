function readUtf8Body(request, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let finished = false;

    request.on("data", (chunk) => {
      if (finished) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > limit) {
        finished = true;
        reject(new Error("Request body too large"));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => {
      if (finished) return;
      finished = true;
      resolve(Buffer.concat(chunks, size).toString("utf8"));
    });
    request.on("error", (error) => {
      if (finished) return;
      finished = true;
      reject(error);
    });
  });
}

module.exports = { readUtf8Body };
