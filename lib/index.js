var app = module.exports = require('./app')();

if (require.main === module) {
  app.run(process.env.GOSGF_PORT);
}
