var FreebaseClient = {
	load:function(options, done){

		var _this = this;

		// we use prototypal inheritance to construct a client with methods that all return a not implemented error
		// we then iterate through the plugins methods and reset the methods that match
		// the done function returns an instance of the client, or an error
		// CAN YOU RUN JQUERY IN NODE? 

		if (!options)
			options = {};

		if (!options.config)
			options.config = {host:'localhost', port:8000, secret:'freebase'};

		try{

			var clientInstance = Object.create(_this.client_prototype)

			if (options.context)
				clientInstance.context = options.context;

			if (options.plugin){
				for (var overrideName in options.plugin)
					clientInstance[overrideName] = options.plugin[overrideName].bind(clientInstance);
			}

			clientInstance.initialize(options.config, function(e){

				if (e)
					return done(e);

				done(null, clientInstance);

			});

		}catch(e){
			done({message:'loader failed', error:e});
		}

	},
	client_prototype:{
		initialized:false,
		events:{},
		messageEvents:{},
		initialize:function(config, done){
			var _this = this;

			_this.config = config;
			_this.config.url = 'http://' + config.host + ':' + config.port;

			_this.authenticate(function(e){

				if (e)
					return done(e);

				_this.initialized = true;
				done();
			});
		},
		authenticate:function(done){
			var _this = this;
			//url, method, headers, data, done

			_this.performRequest(_this.config.url + '/auth', 'POST', {secret:_this.config.secret}, function(e, result){

				if (e)
					return done(e);

				if (result.status == 'ok'){

					var session_token = result.payload;
					_this.token = session_token;

					var Primus = require('primus'), 
					Socket = Primus.createSocket({ "transformer": _this.config.transformer, "parser": _this.config.parser, "manual":true });

	  				_this.pubsub = new Socket(_this.config.url);

	  				_this.pubsub.on('error',  _this.handle_error.bind(_this));
					_this.pubsub.on('data', _this.handle_event.bind(_this));

					done();

				}else
					done(result.payload);

			});
		},
		parseJSON:function(b){
			var _this = this;
			try
			{
				if (typeof(b) == 'object')
					return b;
				
				if (b != null && b != undefined)
				{
					return JSON.parse(b);
				}
				else 
					throw 'b is null';
			}
			catch(e)
			{
				return b;
			}
		},
		performRequest:function(url, method, data, done){

			var _this = this;

			if (!_this.initialized && url != _this.config.url + '/auth')
				done('Client not initialized yet.');

			var basetype = 'object';
			if (data instanceof Array)
				basetype = 'array';

			var params = {"uri":url, "method":method, "headers":_this.getHeaders()};
			params.json = {encapsulated:data, basetype:basetype, client:'node'};

			require('request')(params, 
			function(e, r, b){

				////console.log('body');
				////console.log(b);

				if (e)
					done(e);
				else
					done(null, _this.parseJSON(b));

			});
		},
		checkPath:function(path){
			var _this = this;

			if (path.match(/^[a-zA-Z0-9//_*/-]+$/) == null)
				throw 'Bad path, can only contain alphanumeric chracters, forward slashes, underscores, a single wildcard * and minus signs ie: /this/is/an/example/of/1/with/an/_*-12hello';
		},
		getHeaders:function(){

			var returnHeaders = {};

			if (this.token){
				//////console.log('SETTING HEADERS');
				returnHeaders['session_token'] = this.token;
			}
				
			return returnHeaders;
		},
		getURL:function(path, parameters){

			var _this = this;
			_this.checkPath(path);

			if (path.substring(0,1) != '/')
				path = '/' + path; 

			var api_url = _this.config.url + path;

			if (parameters)
				api_url += "?parameters=" + new Buffer(JSON.stringify(parameters)).toString('base64');

			return api_url;
			
		},
		getChannel:function(path, action){

			var _this = this;
			_this.checkPath(path);

			return '/' + action + '@' + path;

		},
		get:function(path, parameters, handler){
			var _this = this;

			_this.performRequest(_this.getURL(path, parameters), 'GET', null, handler);
		},
		getChild:function(path, childId, handler){
			var _this = this;

			_this.get(path, {child_id:childId}, handler);
		},
		getPaths:function(path, handler){
			var _this = this;

			_this.get(path, {options:{path_only:true}}, handler);
		},
		set:function(path, data, options, handler){
			var _this = this;
			
			_this.performRequest(_this.getURL(path, options), 'PUT', data, handler);
		},
		setChild:function(path, data, handler){
			var _this = this;

			_this.set(path, data, {set_type:'child'}, handler);
		},
		setSibling:function(path, data, handler){
			var _this = this;

			_this.set(path, data, {set_type:'sibling'}, handler);
		},
		remove:function(path, options, handler){
			var _this = this;
			
			_this.performRequest(_this.getURL(path, options), 'DELETE', null, handler);
		},
		removeChild:function(path, childId, handler){
			var _this = this;
			
			_this.remove(path, {child_id:childId}, handler);
		},
		handle_error:function(err){
			 console.error('Something horrible has happened', err.stack);
		},
		handle_event:function(message){

			var _this = this;

			//console.log(message);

			if (message.type == 'data'){

			  	if (message.path == '/ALL@all')
			  		_this.handle_data(message.path, message);
			  	else
			  		_this.handle_data(message.path, message.payload);

		  	}else if(message.type == 'message'){
		  		_this.handle_message(message);
		  	}
		},
		handle_message:function(message){
			var _this = this;

			//console.log('in handle message');
			//console.log(message);

			if (_this.messageEvents[message.messageType] && _this.messageEvents[message.messageType].length > 0){

				_this.messageEvents[message.messageType].map(function(delegate, index, arr){
					delegate.handler.call(_this, message);
				});
			}
		},
		handle_data:function(path, message){

			var _this = this;

			if (_this.events[path] && _this.events[path].length > 0){
				_this.events[path].map(function(delegate, index, arr){

					if (!delegate.runcount)
						delegate.runcount = 0;

					delegate.runcount++;

					if (delegate.count > 0 && delegate.count == delegate.runcount)
						arr.splice(index);

					delegate.handler.call(_this, message.error, message);
				});
			}
		},
		onMessage:function(key, type, handler, done){

			var _this = this;

			try{
				
				if (!_this.messageEvents[type])
					_this.messageEvents[type] = [];

				_this.messageEvents[type].push({"key":key, "handler":handler});

				done();

			}catch(e){
				done(e);
			}
		},
		on:function(path, event_type, count, handler, done){

			var _this = this;

			try{
				
				if (!_this.token)
					throw "You are attempting to subscribe without a session token";

				event_type = event_type.toUpperCase();

				path = _this.getChannel(path, event_type);

				_this.pubsub.write({"action":"on","path":path,"token":_this.token});

				if (!_this.events[path])
					_this.events[path] = [];

				_this.events[path].push({handler:handler, count:count});

				//console.log({handler:handler, count:count});

				done();

			}catch(e){
				done(e);
			}
		},
		onAll:function(handler, done){

			var _this = this;
	
			_this.on('all', 'all', 0, handler, done);
		},
		off:function(path, event_name, handler){

			var _this = this;
			path = _this.getPath(path, event_name);

			if (_this.events[path] && _this.events[path].length > 0){
				_this.events[path].map(function(delegate, index, arr){
					if (delegate.handler === handler){
						arr.splice(index);
						if (arr.length == 0)
							delete _this.events[path];
					}
						
				});				
			}
		}
	}
}

module.exports = FreebaseClient;