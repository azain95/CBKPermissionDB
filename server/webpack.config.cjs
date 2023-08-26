const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "production",
  entry: "./index.js",
  output: {
    path: path.join(__dirname, "dist"),
    publicPath: "/",
    filename: "final.cjs",
  },
  target: "node",
  module: {
    // ... rest of your configuration
  },
  plugins: [
    // Add the CopyPlugin configuration
    new CopyPlugin({
      patterns: [
        {
          from: "database.sql", // Path to the source file
          to: path.join(__dirname, "dist"), // Path to the destination folder
        },
      ],
    }),
  ],
};
