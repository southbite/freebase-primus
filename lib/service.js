var cluster = require('cluster'),
    async = require('async'),
    http      = require('http'),
    connect = require('connect'),
    utils = require('./utils');


module.exports = {
  initialize:function(config, done){
    
    var port = config.port?config.port:8000;
    utils.initialize(config.utils);

    var initializeWorker = function(){
     
      var freebase = {services:{}, config:config};
      var app = connect();
      
      var bodyParser = require('body-parser')
      app.use(bodyParser.json());

      var loadMiddleware = function(middleware_name){

         //////console.log('loading middleware ' + middleware_name);
          var middleware = require('./middleware/' + middleware_name);
          
          middleware.freebase = freebase;
          app.use(middleware.process.bind(middleware));

          if (middleware['process_error'])
            app.use(middleware.process_error.bind(middleware));
      };

      loadMiddleware('client');
      loadMiddleware('prepare');
      loadMiddleware('auth');
      loadMiddleware('data');
      loadMiddleware('respond');

      freebase.utils = utils;
      freebase.server = http.createServer(app);

      var loadService = function(serviceName, service, serviceLoaded){

        var serviceInstance;

        if (!service.instance){
          try{

            if (!service.path)
              service.path = './services/' + serviceName;

            serviceInstance = require(service.path);

          }catch(e){
            utils.log('Failed to instantiate service: ' + serviceName, 'error');
            utils.log(e, 'error');
          }
        }else
          serviceInstance = service.instance;

        
        serviceInstance.freebase = freebase;
        freebase.services[serviceName] = serviceInstance;

        if (serviceInstance['initialize']){

          if (!service.config)
            service.config = {};

          serviceInstance.initialize(service.config, function(e){
            serviceLoaded(e);
          });

        }else{
          serviceLoaded();
        }
      }

      async.eachSeries(Object.keys(config.services), function(serviceName, callback) {
        var service = config.services[serviceName];
        //////console.log('loading service ' + serviceName);
        loadService(serviceName, service, callback);
      }, 
      function(err){
          if (err){

            utils.log('Failed to initialize services', 'error');
            utils.log(err, 'error');

            process.exit(1);
          }
      });

      freebase.server.listen(port);
      return freebase;
    }

    try{
      var freebase = initializeWorker();
      done(null, freebase);
    }catch(e){
      done(e);
    }
  },
  localClient: function(){

  }
}




