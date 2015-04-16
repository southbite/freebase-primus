var expect = require('expect.js');
var freebase = require('../lib/index')
var service = freebase.service;
var freebase_client = freebase.client;
var faye = require('faye');
var async = require('async');

var testport = 8000;
var test_secret = 'test_secret';
var mode = "embedded";
var default_timeout = 4000;
var freebaseInstance = null;

var publisherclient;
var listenerclient;

async.series([
    function(callback){
        try{
			service.initialize({
					mode:'embedded', 
					services:{
						auth:{
							path:'./services/auth/service.js',
							config:{
								authTokenSecret:'a256a2fd43bf441483c5177fc85fd9d3',
								systemSecret:test_secret
							}
						},
						data:{
							path:'./services/data_embedded/service.js',
							config:{}
						},
						pubsub:{
							path:'./services/pubsub/service.js',
							config:{}
						}
					},
					utils:{
						log_level:'info|error|warning',
						log_component:'prepare'
					}
				}, 
				function(e, freebase){
					if (e)
						return callback(e);

					freebaseInstance = freebase;
					callback(null, 'service initialized');
				});
		}catch(e){
			callback(e);
		}
    },
    function(callback){
        try{
			//plugin, config, context, 
			//plugin, config, context, 
			freebase_client.load({plugin:freebase.client_plugins.intra_process, context:freebaseInstance}, function(e, client){

				publisherclient = client;

				if (e)
					return callback(e);

				freebase_client.load({plugin:freebase.client_plugins.intra_process, context:freebaseInstance}, function(e, client){

					if (e)
						return callback(e);

					listenerclient = client;
					callback(null, 'clients loaded');

				});

			});

		}catch(e){
			callback(e);
		}
    },
    function(callback){
      
		freebase_client.load({
			plugin:freebase.client_plugins.intra_process, 
			context:freebaseInstance}, function(e, client){

			if (e)
				return callback(e);

			var stressTestClient = client;

			setTimeout(function(){
				
			    var count = 0;
			    var expected=1000;
			    var receivedCount=0;

			    var received = {};
			    var sent = [expected];

			    for (var i=0;i<expected;i++) {
			      sent[i] = require('shortid').generate();
			    }

			    //////console.log('about to go');
			    //////console.log(sent);

			    //first listen for the change
			    stressTestClient.on('/e2e_test1/testsubscribe/sequence', 'PUT', 0, function (e, message) {

			      //////console.log('Event happened', message);

			      if (e)
			      	return callback(e);

			      receivedCount++;

			      if (received[message.data.property1])
			      	received[message.data.property1] = received[message.data.property1] + 1;
			      else
			      	received[message.data.property1] = 1;

			      //////console.log('RCOUNT');


			      //console.log(receivedCount);
			      //console.log(sent.length);

			      if (receivedCount == sent.length) {
			        console.timeEnd('timeTest');
			        expect(Object.keys(received).length == expected).to.be(true);
			        //////console.log(received);

			        callback(null, 'should handle sequences of events by writing as soon as possible');
			      }
			      
			    }, function (e) {

			      //////console.log('ON HAS HAPPENED: ' + e);

			      if (!e) {

			      	 expect(stressTestClient.events['/PUT@/e2e_test1/testsubscribe/sequence'].length).to.be(1);
			      	 console.time('timeTest');

			      	 while(count < expected){

			      	 	//////console.log(count);
			      	 	//////console.log(expected);
			      	 	//////console.log(sent[count]);

				      publisherclient.set('/e2e_test1/testsubscribe/sequence', {
				        property1: sent[count]
				      }, {excludeId:true}, function (e, result) {

				      	//////console.log(e);
				      	//////console.log(result);

				      	if (e)
				      		return callback(e);

				      		
				      });

				      count++;
				    }

			      }
			      else
			        callback(e);
			    });

			}, 2000)

			
		}); 
    },
    function(callback){
        var stressTestClient = listenerclient;
		
	    var count = 0;
	    var expected=1000;
	    var receivedCount=0;

	    var received = {};
	    var sent = [expected];

	    for (var i=0;i<expected;i++) {
	      sent[i] = require('shortid').generate();
	    }

	    //////console.log('about to go');
	    //////console.log(sent);

	    //first listen for the change
	    stressTestClient.on('/e2e_test1/testsubscribe/sequence3', 'PUT', 0, function (e, message) {

	      //////console.log('Event happened', message);

	      if (e)
	      	return callback(e);

	      receivedCount++;

	      if (received[message.data.property1])
	      	received[message.data.property1] = received[message.data.property1] + 1;
	      else
	      	received[message.data.property1] = 1;

	      //////console.log('RCOUNT');


	      //console.log(receivedCount);
	      //console.log(sent.length);

	      if (receivedCount == sent.length) {
	        console.timeEnd('timeTest');
	        expect(Object.keys(received).length == expected).to.be(true);
	        //////console.log(received);

	        callback(null,'should handle sequences of events by writing as soon as possible, without storing');
	      }
	      
	    }, function (e) {

	      //////console.log('ON HAS HAPPENED: ' + e);

	      if (!e) {

	      	 expect(stressTestClient.events['/PUT@/e2e_test1/testsubscribe/sequence3'].length).to.be(1);
	      	 console.time('timeTest');

	      	 while(count < expected){

	      	 	//////console.log(count);
	      	 	//////console.log(expected);
	      	 	//////console.log(sent[count]);

		      publisherclient.set('/e2e_test1/testsubscribe/sequence3', {
		        property1: sent[count]
		      }, {noStore:true}, function (e, result) {

		      	//////console.log(e);
		      	//////console.log(result);

		      	if (e)
		      		return callback(e);

		      		
		      });

		      count++;
		    }

	      }
	      else
	        callback(e);
	});
},
function(callback){
	var stressTestClient = listenerclient;
	
    var count = 0;
    var expected=1000;
    var received = [];

    var sent = [];
    for (var i=0;i<expected;i++) {
      sent.push(i);
    }

    //first listen for the change
    listenerclient.on('/e2e_test1/testsubscribe/sequence1', 'PUT', 0, function (e, message) {

      //console.log('Event happened', message);

      received.push(message.data.property1);

      if (received.length == expected) {
        console.timeEnd('timeTest');
        expect(received.length).to.be(sent.length);
     
        callback(null, 'should handle sequences of events by when the previous one is done');
      }

    }, function (e) {

      //////////////console.log('ON HAS HAPPENED: ' + e);

      if (!e) {

        //////////////console.log('on subscribed, about to publish');
        //then make the change
        console.time('timeTest');
        writeData();
      }
      else
        callback(e);
    });

    function writeData () {

      if (count == expected) {
        return;
      };

      ////////console.log('putting data: ', count);
      publisherclient.set('/e2e_test1/testsubscribe/sequence1', {
        property1: sent[count++]
      }, {noStore:true}, function (e, result) {
        writeData();
      });
    }
}],
// optional callback
function(err, results){
	if (!err)
     console.log(results);
 	else
 	 console.error(err);
});
