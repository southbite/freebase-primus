function FreebaseClient(options, initializedCallback){
	var _this = this;

	if (!options)
		options = {};

	if (!options.config)
		options.config = {host:'127.0.0.1', port:8000, secret:'freebase'};

	if (!options.config.pubsub)
		options.config.pubsub = {};

	if (!options.config.pubsub.options)
		options.config.pubsub.options = {};

	_this.initialized = false;
	_this.events = {};
	_this.messageEvents = {};
	_this.requestEvents = {};
	_this.currentEventId = 0;

	_this.initialize = function(config, done){
		var _this = this;

		_this.config = config;
		_this.config.url = 'http://' + config.host + ':' + config.port;

		/*BEGIN CLIENT-SIDE ADAPTER - DO NOT REMOVE THIS COMMENT

		if (!$)
			throw 'JQUERY NOT FOUND FOR CLIENT-SIDE ADAPTER';

		//////////////////////console.log('initializing browser client');
		//////////////////////console.log(config.url);
		//////////////////////console.log(config);

		_this.config = config;
		_this.config.url = 'http://' + config.host + ':' + config.port;

		$.getScript( _this.config.url + '/browser_primus.js', function( data, textStatus, jqxhr ) {

			if (textStatus != 'success')
				throw "Failed to load the primus client library: " + textStatus;
			else{
			
				if (!Primus)
					throw 'PRIMUS NOT FOUND FOR CLIENT-SIDE ADAPTER';


			//////////////////////console.log('have primus');
			//////////////////////console.log(Primus);
		*///END CLIENT-SIDE ADAPTER

				_this.authenticate(function(e){

					if (e)
						return done(e);

					_this.initialized = true;
					done();
				});

		/*BEGIN CLIENT-SIDE ADAPTER - DO NOT REMOVE THIS COMMENT
			}
		});
		*///END CLIENT-SIDE ADAPTER
	};

	_this.authenticate = function(done){
		var _this = this;

		////////////////console.log('authenticating');

		//BEGIN SERVER-SIDE ADAPTER - DO NOT REMOVE THIS COMMENT
		var Primus = require('primus'), 
		Socket = Primus.createSocket({ "transformer": _this.config.transformer, "parser": _this.config.parser, "manual":true });

		//console.log('_this.config.url');
		//console.log(_this.config.url);
		_this.pubsub = new Socket(_this.config.url);
		//END SERVER-SIDE ADAPTER

		/*BEGIN CLIENT-SIDE ADAPTER - DO NOT REMOVE THIS COMMENT
			_this.pubsub = Primus.connect(_this.config.url, _this.config.pubsub.options);
		*///END CLIENT-SIDE ADAPTER

		_this.pubsub.on('error',  _this.handle_error.bind(_this));
		_this.pubsub.on('data', _this.handle_publication.bind(_this));


		//console.log('pub sub initialized, performing logon');

		return _this.performRequest(null, 'login', {secret:_this.config.secret}, null, function(e, result){

			//console.log('auth performed');
			////////////////console.log(_this.config);
			//console.log([e, result]);

			if (e)
				return done(e);

			if (result.status == 'ok'){

				var session_token = result.payload;
				_this.token = session_token;

				done();

			}else
				done(result.payload);

		});
	};

	_this.parseJSON = function(b){
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
	};

	_this.getEventId = function(){
		return this.currentEventId += 1;
	};

	_this.performRequest = function(path, action, data, parameters, done){

		var _this = this;

		////////////////console.log(arguments);

		if (!_this.initialized && action != 'login') return done('Client not initialized yet.');

		if (!parameters) parameters = {};

		var message = {"path":path, "action":action, "eventId":_this.getEventId(), "parameters":parameters, "data":data};

		if (_this.token)
			message.token = _this.token;

		if (!parameters.timeout)
			parameters.timeout = 10000;

		////////////////console.log(message);

		if (done){//if null we are firing and forgetting
				var callbackHandler = {
				"eventId":message.eventId,
				"client":_this,
				"handler":done
			};

			callbackHandler.handleResponse = function(response){
				clearTimeout(this.timedout);
				//////////////console.log("handling response");
				//////////////console.log(response);
				return this.handler(null, response);
			}.bind(callbackHandler);

			callbackHandler.timedout = setTimeout(function(){
				delete this.client.requestEvents[this.eventId];
				return this.handler("Request timed out");
			}.bind(callbackHandler),parameters.timeout);

			//we add our event handler to a queue, with the embedded timeout
			_this.requestEvents[message.eventId] = callbackHandler;
		}

		//console.log('writing...');
		_this.pubsub.write(message);
	};

	_this.checkPath = function(path){
		var _this = this;

		if (path.match(/^[a-zA-Z0-9//_*/-]+$/) == null)
			throw 'Bad path, can only contain alphanumeric chracters, forward slashes, underscores, a single wildcard * and minus signs ie: /this/is/an/example/of/1/with/an/_*-12hello';
	};

	_this.getURL = function(path, parameters){

		var _this = this;
		_this.checkPath(path);

		if (path.substring(0,1) != '/')
			path = '/' + path; 

		var api_url = _this.config.url + path;

		if (parameters)
			//BEGIN SERVER-SIDE ADAPTER - DO NOT REMOVE THIS COMMENT
			api_url += "?parameters=" + new Buffer(JSON.stringify(parameters)).toString('base64');
			//END SERVER-SIDE ADAPTER
			/*BEGIN CLIENT-SIDE ADAPTER - DO NOT REMOVE THIS COMMENT
			api_url += "?parameters=" + btoa(JSON.stringify(parameters));
			*///END CLIENT-SIDE ADAPTER
		return api_url;
		
	};

	_this.getChannel = function(path, action){

		var _this = this;
		_this.checkPath(path);

		return '/' + action.toUpperCase() + '@' + path;

	};

	_this.get = function(path, parameters, handler){
		this.performRequest(path, 'get', null, parameters, handler);
	};

	_this.getChild = function(path, childId, handler){
		var _this = this;

		_this.get(path, {child_id:childId}, handler);
	};

	_this.getPaths = function(path, handler){
		var _this = this;

		_this.get(path, {options:{path_only:true}}, handler);
	};

	_this.set = function(path, data, parameters, handler){
		var _this = this;
		_this.performRequest(path, 'set', data, parameters, handler);
	};

	_this.setChild = function(path, data, handler){
		var _this = this;

		_this.set(path, data, {set_type:'child'}, handler);
	};

	_this.setSibling = function(path, data, handler){
		var _this = this;

		_this.set(path, data, {set_type:'sibling'}, handler);
	};

	_this.remove = function(path, parameters, handler){
		//path, action, data, parameters, done
		return this.performRequest(path, 'remove', null, parameters, handler);
	};

	_this.removeChild = function(path, childId, handler){
		var _this = this;
		
		_this.remove(path, {child_id:childId}, handler);
	};

	_this.handle_error = function(err){
		//console.log(err);
		console.error('Something horrible has happened', err.stack);
	};

	_this.handle_publication = function(message){

		var _this = this;

		////////////console.log('handling publication');
		////////////console.log(message);
		if (message.type == 'data'){
		  	if (message.channel == '/ALL@*')
		  		_this.handle_data(message.channel, message);
		  	else
		  		_this.handle_data(message.channel, message.payload);

	  	}else if (message.type == 'message'){
	  		_this.handle_message(message);
	  	}else if (message.type == "response"){
	  		_this.handle_response(message);
	  	}
	};
	
	_this.handle_response = function(response){
		var _this = this;
		var responseHandler = _this.requestEvents[response.eventId];

		if (responseHandler)
			responseHandler.handleResponse(response);
	};
	
	_this.handle_message = function(message){
		var _this = this;

		////////////////////////console.log('in handle message');
		////////////////////////console.log(message);

		if (_this.messageEvents[message.messageType] && _this.messageEvents[message.messageType].length > 0){
			_this.messageEvents[message.messageType].map(function(delegate, index, arr){
				delegate.handler.call(_this, message);
			});
		}
	};
	
	_this.handle_data = function(path, message){

		var _this = this;

		//////////console.log('_this.events');
		//////////console.log(_this.events);
		//////////console.log(arguments);

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
	};
	
	_this.onMessage = function(key, type, handler, done){

		var _this = this;

		try{
			
			if (!_this.messageEvents[type])
				_this.messageEvents[type] = [];

			_this.messageEvents[type].push({"key":key, "handler":handler});

			done();

		}catch(e){
			done(e);
		}
	};
	
	_this.on = function(path, parameters, handler, done){
		var _this = this;

		/*
		Parameters are:
		event_type, either set, remove or all, defaults to all
		count, the amount of times you want your handler to handle things, defaults to 0 - (infinite handling)

		*/

		if (!parameters) parameters = {};
		if (!parameters.event_type) parameters.event_type = 'all';
		if (!parameters.count) parameters.count = 0;
		//if (!parameters.count) parameters.count = 0;
		
		path = _this.getChannel(path, parameters.event_type);

		_this.performRequest(path, 'on', {"token":_this.token}, null, function(e, response){
			////////console.log('on response');
			////////console.log(arguments);

			if (e)
				return done(e);

			if (response.status == 'error')
				return done(response.payload);

			if (!_this.events[path])
				_this.events[path] = [];

			_this.events[path].push({handler:handler, count:parameters.count});

			done();
		});

	};
	
	_this.onAll = function(handler, done){
		var _this = this;

		_this.on('*', null, handler, done);
	};

	_this.off = function(path, event_name, handler){

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
	};

	if (options.context)
		_this.context = options.context;
	////////////////console.log('about to initialize2');

	if (options.plugin){
		for (var overrideName in options.plugin){
			if (options.plugin.hasOwnProperty(overrideName)){
				_this[overrideName] = options.plugin[overrideName].bind(_this);
			}
		}		
	}

	if (initializedCallback){
		_this.initialize(options.config, function(e){
			if (e)
				return initializedCallback(e);

			initializedCallback(null, _this);
		});
	}
}
//BEGIN SERVER-SIDE ADAPTER - DO NOT REMOVE THIS COMMENT
module.exports = FreebaseClient;
//END SERVER-SIDE ADAPTER