
const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Block serving local MediaPipe files to force CDN usage
app.use((req, res, next) => {
  const blocked = ['/hands.js', '/camera_utils.js', '/drawing_utils.js'];
  if (blocked.includes(req.path)) {
    res.status(404).send('Not found');
  } else {
    next();
  }
});

// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
