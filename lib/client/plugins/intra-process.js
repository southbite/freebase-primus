module.exports = {
	initialize:function(config, done){
		var _this = this;

		_this.config = config;
		_this.dataService = _this.context.services.data;
		_this.pubSubService = _this.context.services.pubsub;
		_this.connectionId = _this.pubSubService.connect(_this.handle_event.bind(_this));

		done();
	},
	authenticate:function(done){
		done('Not necessary for implementation');
	},
	performRequest:function(url, method, data, done){
		done('Not necessary for implementation');
	},
	checkPath:function(path){
		var _this = this;

		if (path.match(/^[a-zA-Z0-9//_*/-]+$/) == null)
			throw 'Bad path, can only contain alphanumeric chracters, forward slashes, underscores, a single wildcard * and minus signs ie: /this/is/an/example/of/1/with/an/_*-12hello';
	},
	getHeaders:function(){
		done('Not necessary for implementation');
	},
	getURL:function(path, parameters){
		done('Not necessary for implementation');
	},
	getChannel:function(path, action){

		var _this = this;
		_this.checkPath(path);

		return '/' + action + '@' + path;

	},
	handleDataResponse:function(e, path, response, parameters, method, handler){

		var _this = this;

		//console.log(arguments);

		var responseData = {
			status:'ok',
			payload:[], 
			published:false
		}

		if (e){
			responseData.status = 'error';
			payload = e;
		}else{

			if (['PUT','DELETE'].indexOf(method) > -1){
				if (!parameters || !parameters.options || !parameters.options.noPublish){
					var message = {payload:response, path:'/' + method + '@' + path, action:method, params:parameters};

					_this.pubSubService.publish(message);
					responseData.published = true;
				}
				responseData.payload = response;
			}else if (['GET','POST'].indexOf(method) > -1){
				if (Array.isArray(response)){
					responseData.payload = response;
				}else{
					responseData.payload = response.toArray();
				}
			}else
				return handler('BAD METHOD: ' + method);

		}

		//console.log(responseData);

		return handler(null, responseData);

	},
	get:function(path, parameters, handler){
		var _this = this;

		if (!parameters)
			parameters = {};

		_this.dataService.get(path, parameters, function(e, response){
			_this.handleDataResponse(e, path, response, parameters, 'GET', handler);
		});
	},
	getChild:function(path, childId, handler){
		var _this = this;

		_this.get(path, {child_id:childId}, handler);
	},
	getPaths:function(path, handler){
		var _this = this;

		_this.get(path, {options:{path_only:true}}, handler);
	},
	setInternal:function(path, data, options, handler){
		var _this = this;

		if (options && options.noStore)
			return _this.handleDataResponse(null, path, _this.dataService.transformSetData(path, data), options, 'PUT', handler);
           
		_this.dataService.upsert(path, data, options, function(e, response){
			_this.handleDataResponse(e, path, response, options, 'PUT', handler);
		});
	},
	setChild:function(path, data, handler){
		var _this = this;

		_this.set(path, data, {set_type:'child'}, handler);
	},
	setSibling:function(path, data, handler){
		var _this = this;

		_this.set(path, data, {set_type:'sibling'}, handler);
	},
	remove:function(path, parameters, handler){
		var _this = this;
		
		 _this.dataService.remove(path, parameters, function(e, response){
			_this.handleDataResponse(e, path, response, parameters, 'DELETE', handler);
		});
	},
	removeChild:function(path, childId, handler){
		var _this = this;
		
		var options = {child_id:childId};

		_this.dataService.remove(path, options, function(e, response){
			_this.handleDataResponse(e, path, response, options, 'DELETE', handler);
		});
	},
	on:function(path, event_type, count, handler, done){

		var _this = this;

		try{
			
			event_type = event_type.toUpperCase();
			path = _this.getChannel(path, event_type);

			_this.pubSubService.addListener(path, _this.connectionId);

			if (!_this.events[path])
				_this.events[path] = [];

			_this.events[path].push({handler:handler, count:count});

			done();

		}catch(e){
			done(e);
		}
	}
}