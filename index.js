const app = require("./src/app");
const { port } = require("./src/config/env");
const { startWorker } = require("./src/workers/scrape.worker");

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);

    startWorker().catch((error) => {
        console.error("Unable to start LinkerIn scrape worker", error);
    });
});
