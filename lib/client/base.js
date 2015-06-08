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
	_this.currentListenerId = 0;

	_this.initialize = function(config, done){
		var _this = this;

		_this.config = config;
		_this.config.url = 'http://' + config.host + ':' + config.port;

		/*BEGIN CLIENT-SIDE ADAPTER - DO NOT REMOVE THIS COMMENT

		if (!$)
			throw 'JQUERY NOT FOUND FOR CLIENT-SIDE ADAPTER';

		////////////////////////console.log('initializing browser client');
		////////////////////////console.log(config.url);
		////////////////////////console.log(config);

		_this.config = config;
		_this.config.url = 'http://' + config.host + ':' + config.port;

		$.getScript( _this.config.url + '/browser_primus.js', function( data, textStatus, jqxhr ) {

			if (textStatus != 'success')
				throw "Failed to load the primus client library: " + textStatus;
			else{
			
				if (!Primus)
					throw 'PRIMUS NOT FOUND FOR CLIENT-SIDE ADAPTER';


			////////////////////////console.log('have primus');
			////////////////////////console.log(Primus);
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

		//////////////////console.log('authenticating');

		//BEGIN SERVER-SIDE ADAPTER - DO NOT REMOVE THIS COMMENT
		var Primus = require('primus'), 
		Socket = Primus.createSocket({ "transformer": _this.config.transformer, "parser": _this.config.parser, "manual":true });

		////console.log('_this.config.url');
		////console.log(_this.config.url);
		_this.pubsub = new Socket(_this.config.url);
		//END SERVER-SIDE ADAPTER

		/*BEGIN CLIENT-SIDE ADAPTER - DO NOT REMOVE THIS COMMENT
			_this.pubsub = Primus.connect(_this.config.url, _this.config.pubsub.options);
		*///END CLIENT-SIDE ADAPTER

		_this.pubsub.on('error',  _this.handle_error.bind(_this));
		_this.pubsub.on('data', _this.handle_publication.bind(_this));


		////console.log('pub sub initialized, performing logon');

		return _this.performRequest(null, 'login', {secret:_this.config.secret}, null, function(e, result){

			////console.log('auth performed');
			//////////////////console.log(_this.config);
			////console.log([e, result]);

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

		if (!_this.initialized && action != 'login') return done('Client not initialized yet.');

		if (!parameters) parameters = {};

		var message = {"path":path, "action":action, "eventId":_this.getEventId(), "parameters":parameters, "data":data};

		if (_this.token)
			message.token = _this.token;

		if (!parameters.timeout)
			parameters.timeout = 10000;

		if (done){//if null we are firing and forgetting
				var callbackHandler = {
				"eventId":message.eventId,
				"client":_this,
				"handler":done
			};

			callbackHandler.handleResponse = function(response){
				clearTimeout(this.timedout);
				////////////////console.log("handling response");
				////////////////console.log(response);
				return this.handler(null, response);
			}.bind(callbackHandler);

			callbackHandler.timedout = setTimeout(function(){
				delete this.client.requestEvents[this.eventId];
				return this.handler("Request timed out");
			}.bind(callbackHandler),parameters.timeout);

			//we add our event handler to a queue, with the embedded timeout
			_this.requestEvents[message.eventId] = callbackHandler;
		}

		////console.log('writing...');
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
		console.error('Something horrible has happened', err.stack);
	};

	_this.handle_publication = function(message){

		var _this = this;

		if (message.type == 'data'){
		  	_this.handle_data(message.channel, message);
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

		if (_this.messageEvents[message.messageType] && _this.messageEvents[message.messageType].length > 0){
			_this.messageEvents[message.messageType].map(function(delegate, index, arr){
				delegate.handler.call(_this, message);
			});
		}
	};
	
	_this.handle_data = function(path, message){

		var _this = this;

		//console.log('in handle_data');
		//console.log(arguments);
		//console.log(_this.events);

		if (_this.events[path]){
			var toDetach = [];
			_this.events[path].map(function(delegate, delegateIndex){
				
				delegate.runcount++;
				if (delegate.count > 0 && delegate.count == delegate.runcount){
					_this._offListener(delegate.id, function(e){
						if (e)
							return _this.handle_error(e);

						delegate.handler.call(_this, message);
					});
				}else 
					delegate.handler.call(_this, message);

			});			
		};
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

		var listenerId = _this.currentListenerId++;

		_this.performRequest(path, 'on', {"token":_this.token}, {"listenerId":listenerId}, function(e, response){
			//console.log('on response');
			//console.log(arguments);

			if (e)
				return done(e);

			if (response.status == 'error')
				return done(response.payload);

			if (!_this.events[path])
				_this.events[path] = [];

			var listener = {handler:handler, count:parameters.count, id:listenerId, runcount:0};

			//console.log(_this.events[path]);
			//console.log("_this.events[path]");

			_this.events[path].push(listener);

			done(null, listenerId);
		});
	};
	
	_this.onAll = function(handler, done){
		var _this = this;

		_this.on('*', null, handler, done);
	};

	_this._remoteOff = function(channel, decrementBy, done){
		var _this = this;

		_this.performRequest(channel, 'off', {"token":_this.token}, {"decrementBy":decrementBy}, function(e, response){
			if (e)
				return done(e);

			if (response.status == 'error')
				return done(response.payload);

			done();
		});
	};

	_this._offListener = function(listenerId, done){
		var _this = this;

		for (var channel in _this.events){
			var listeners = _this.events[channel];

			if (!listeners)
				return done();

			listeners.every(function(listener, listenerIndex){
				if (listener.id == listenerId){
					_this._remoteOff(channel, 1, function(e){
						if (e)
							return done(e);
						listeners.splice(listenerIndex, 1);
						done();
					});
					return false;
				} else return true;
			});
		}	
	};

	_this._offPath = function(path, done){
		var _this = this;

		var listenersFound = false;
		for (var channel in _this.events){
			if (channel.split('@')[1] == path){
				listenersFound = true;
				return _this._remoteOff(channel, _this.events[channel].length, function(e){
					if (e)
						return done(e);

					delete _this.events[channel];
					done();
				});
			}
		}

		if (!listenersFound)
			done();
	}

	_this.offAll = function(done){
		var _this = this;

		return _this._remoteOff('*', 0, function(e){
			if (e)
				return done(e);

			_this.events = {};
			done();
		});
	}

	_this.off = function(listenerRef, done){
	
		var _this = this;

		if (!listenerRef)
			return done(new Error('listenerRef cannot be null'));

		if (typeof listenerRef == "number")
			return _this._offListener(listenerRef, done);
		
		return _this._offPath(listenerRef, done);
	}

	if (options.context)
		_this.context = options.context;
	//////////////////console.log('about to initialize2');

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