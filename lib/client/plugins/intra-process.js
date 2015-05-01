module.exports = {
	initialize:function(config, done){
		var _this = this;

		try{

			//console.log('initializing intra-proc');
			
			_this.config = config;
			_this.dataService = _this.context.services.data;
			_this.pubsub = _this.context.services.pubsub;

			_this.token = _this.pubsub.connect(_this.handle_publication.bind(_this));

			//console.log('initialized intra-proc');
			done();

		}catch(e){
			done(e);
		}
	},
	performRequest:function(path, action, data, parameters, handler){
		
		var _this = this;

		if (!parameters)
			parameters = {};

		var message = {"path":path, "action":action, "eventId":_this.getEventId(), "parameters":parameters, "token":_this.token};
		var eventSourceStub = {
			write:function(response){
				if (response.status == 'error') return handler(response);

				return handler(null, response);
			}
		}

		if (action == "set"){

			if (parameters && parameters.noStore) return _this.pubsub.handleDataResponse(null, message, _this.dataService.transformSetData(path, data), eventSourceStub);
           
			_this.dataService.upsert(path, data, parameters, function(e, response){
				return _this.pubsub.handleDataResponse(e, message, response, eventSourceStub);
			});

		}else if (action == "get"){

			_this.dataService.get(path, parameters, function(e, response){
				_this.pubsub.handleDataResponse(e, message, response, eventSourceStub);
			});

		}else if (action == "remove"){

			_this.dataService.remove(path, parameters, function(e, response){
				return _this.pubsub.handleDataResponse(e, message, response, eventSourceStub);
			});

		}else
			return handler("Invalid action: " + action);

	},
	set:function(path, data, parameters, handler){
		var _this = this;
		setImmediate(function(){
			_this.setInternal(path, data, parameters, handler);
		});
	},
	setInternal:function(path, data, parameters, handler){
		this.performRequest(path, "set", data, parameters, handler);
	},
	on:function(path, event_type, count, handler, done){

		var _this = this;

		try{
			
			event_type = event_type.toUpperCase();
			path = _this.getChannel(path, event_type);

			_this.pubsub.addListener(path, _this.token);

			if (!_this.events[path])
				_this.events[path] = [];

			_this.events[path].push({handler:handler, count:count});

			////////console.log(_this.events);

			done();

		}catch(e){
			done(e);
		}
	}
}