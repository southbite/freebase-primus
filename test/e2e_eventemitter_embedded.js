var expect = require('expect.js');
var freebase = require('../lib/index')
var service = freebase.service;
var freebase_client = freebase.client;
var faye = require('faye');
var async = require('async');

describe('e2e test', function() {

	var testport = 8000;
	var test_secret = 'test_secret';
	var mode = "embedded";
	var default_timeout = 10000;
	var freebaseInstance = null;
	/*
	This test demonstrates starting up the freebase service - 
	the authentication service will use authTokenSecret to encrypt web tokens identifying
	the logon session. The utils setting will set the system to log non priority information
	*/

	it('should initialize the service', function(callback) {
		
		this.timeout(20000);

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
					callback();
				});
		}catch(e){
			callback(e);
		}
	});

	var publisherclient;
	var listenerclient;

	/*
	We are initializing 2 clients to test saving data against the database, one client will push data into the 
	database whilst another listens for changes.
	*/
	it('should initialize the clients', function(callback) {
		
		this.timeout(default_timeout);

		try{
			//plugin, config, context, 
			freebase_client.load({plugin:freebase.client_plugins.intra_process, context:freebaseInstance}, function(e, client){

				publisherclient = client;

				if (e)
					return callback(e);

				freebase_client.load({plugin:freebase.client_plugins.intra_process, context:freebaseInstance}, function(e, client){

					if (e)
						return callback(e);

					listenerclient = client;

					setTimeout(function(){
						callback(e);
					}, 2000)

					
				});


			});

		}catch(e){
			callback(e);
		}
	});

	it('should subscribe to the catch all notification', function(callback) {

		var caught = {};

		this.timeout(10000);
		
		listenerclient.onAll(function(e, message){

			if (!caught[message.action])
				caught[message.action] = 0;

			caught[message.action]++;
			
			if (caught['PUT'] == 2 && caught['DELETE'] == 2)
				callback();


		}, function(e){

			if (e)
				callback(e);
			else {

				publisherclient.set('/e2e_test1/testsubscribe/data/catch_all', {property1:'property1',property2:'property2',property3:'property3'}, null, function(e, put_result){

					////////////console.log('put_result');
					////////////console.log(put_result);

					publisherclient.setChild('/e2e_test1/testsubscribe/data/catch_all_array', {property1:'property1',property2:'property2',property3:'property3'}, function(e, post_result){

						////////////console.log('post_result');
						////////////console.log(post_result);

						publisherclient.remove('/e2e_test1/testsubscribe/data/catch_all', null, function(e, del_result){

							////////////console.log('del_result');
							////////////console.log(del_result);

							publisherclient.removeChild('/e2e_test1/testsubscribe/data/catch_all_array', post_result.payload._id, function(e, del_ar_result){

								////////////console.log('del_ar_result');
								////////////console.log(del_ar_result);
						
							});
					
						});
					
					});

				});

			}

		});

	});

	it('the publisher should set new data ', function(callback) {
		
		this.timeout(default_timeout);

		try{
			var test_path_end = require('shortid').generate();

			publisherclient.set('e2e_test1/testsubscribe/data/' + test_path_end, {property1:'property1',property2:'property2',property3:'property3'}, {noPublish:true}, function(e, result){
			
				console.log('set happened');
				console.log([e, result]);

				if (!e){
					publisherclient.get('e2e_test1/testsubscribe/data/' + test_path_end, null, function(e, results){
						console.log('new data results');
						console.log([e, results]);

						expect(results.payload.length == 1).to.be(true);
						expect(results.payload[0].data.property1 == 'property1').to.be(true);

						if (mode != 'embedded')
							expect(results.payload[0].created == results.payload[0].modified).to.be(true);

						callback(e);
					});
				}else
					callback(e);
			});

		}catch(e){
			callback(e);
		}
	});


	it('should set data, and then merge a new document into the data without overwriting old fields', function(callback) {
		
		this.timeout(default_timeout);

		try{

			var test_path_end = require('shortid').generate();

			publisherclient.set('e2e_test1/testsubscribe/data/merge/' + test_path_end, {property1:'property1',property2:'property2',property3:'property3'}, null, function(e, result){
			
				if (e)
					return callback(e);

				//console.log('set results');
				//console.log(result);

				publisherclient.set('e2e_test1/testsubscribe/data/merge/' + test_path_end, {property4:'property4'}, {merge:true}, function(e, result){

					if (e)
						return callback(e);

					//console.log('merge set results');
					//console.log(result);

					publisherclient.get('e2e_test1/testsubscribe/data/merge/' + test_path_end, null, function(e, results){

						if (e)
							return callback(e);

						//console.log('merge get results');
						//console.log(results);

						expect(results.payload[0].data.property4).to.be('property4');
						expect(results.payload[0].data.property1).to.be('property1');
						
						callback();

					});  

				});
				
			});

		}catch(e){
			callback(e);
		}
	});


	it('should search for a complex object', function(callback) {

		//////////////console.log('DOING COMPLEX SEARCH');

		var test_path_end = require('shortid').generate();

		var complex_obj = {
			regions:['North','South'],
			towns:['North.Cape Town'],
			categories:['Action','History'],
			subcategories:['Action.angling','History.art'],
			keywords:['bass','Penny Siopis'],
			field1:'field1'
		};

		
		var criteria1 = {
				$or: [ {"data.regions": { $in: ['North','South','East','West'] }}, 
					   {"data.towns": { $in: ['North.Cape Town', 'South.East London'] }}, 
					   {"data.categories": { $in: ["Action","History" ] }}],
				"data.keywords": {$in: ["bass", "Penny Siopis" ]}}

		var	options1 = {fields:{"data":1},
			sort:{"data.field1":1},
			limit:1}

		var criteria2 = null;
				
		var	options2 = {fields:null,
			sort:{"field1":1},
			limit:2}

		publisherclient.set('/e2e_test1/testsubscribe/data/complex/' + test_path_end, complex_obj, null, function(e, put_result){
			expect(e == null).to.be(true);
			publisherclient.set('/e2e_test1/testsubscribe/data/complex/' + test_path_end + '/1', complex_obj, null, function(e, put_result){
				expect(e == null).to.be(true);

				console.log('searching');
				publisherclient.get('/e2e_test1/testsubscribe/data/complex*', {criteria:criteria1, options:options1}, function(e, search_result){

					console.log([e, search_result]);

					expect(e == null).to.be(true);
					expect(search_result.payload.length == 1).to.be(true);

					publisherclient.get('/e2e_test1/testsubscribe/data/complex*', {criteria:criteria2, options:options2}, function(e, search_result){

						expect(e == null).to.be(true);
						expect(search_result.payload.length == 2).to.be(true);

						callback(e);
					});

				});

			});

		});

	});


	

	


	it('the listener should pick up a single delete event', function(callback) {
		
		this.timeout(default_timeout);

		try{

				//We put the data we want to delete into the database
				publisherclient.set('/e2e_test1/testsubscribe/data/delete_me', {property1:'property1',property2:'property2',property3:'property3'}, null, function(e, result){

					//////console.log('did delete set');

					//We listen for the DELETE event
					listenerclient.on('/e2e_test1/testsubscribe/data/delete_me', 'DELETE', 1, function(e, message){

						//////console.log('delete message');
						//////console.log(message);

						//we are looking at the event internals on the listener to ensure our event management is working - because we are only listening for 1
						//instance of this event - the event listener should have been removed 
						expect(listenerclient.events['/DELETE@/e2e_test1/testsubscribe/data/delete_me'].length).to.be(0);

						//we needed to have removed a single item
						expect(message.removed).to.be(1);

						////////////////console.log(message);

						callback(e);

					}, function(e){

						//////console.log('ON HAS HAPPENED: ' + e);

						if (!e){

							expect(listenerclient.events['/DELETE@/e2e_test1/testsubscribe/data/delete_me'].length).to.be(1);

							//////console.log('subscribed, about to delete');

							//We perform the actual delete
							publisherclient.remove('/e2e_test1/testsubscribe/data/delete_me', null, function(e, result){

								
									//////console.log('REMOVE HAPPENED!!!');
									//////console.log(e);
									//////console.log(result);
								

								////////////////console.log('put happened - listening for result');
							});
						}else
							callback(e);
					});
				});

			

		}catch(e){
			callback(e);
		}
	});
	

	it('should delete some test data', function(callback) {

		this.timeout(default_timeout);

		try{

			//We put the data we want to delete into the database
			publisherclient.set('/e2e_test1/testsubscribe/data/delete_me', {property1:'property1',property2:'property2',property3:'property3'}, {noPublish:true}, function(e, result){

				//We perform the actual delete
				publisherclient.remove('/e2e_test1/testsubscribe/data/delete_me', {noPublish:true}, function(e, result){

					expect(e).to.be(null);
					expect(result.status).to.be('ok');

					////////console.log('DELETE RESULT');
					////////console.log(result);
					
					callback();
				});
					
			});

		}catch(e){
			callback(e);
		}

	});

	it('the publisher should set new data then update the data', function(callback) {
		
		this.timeout(default_timeout);

		try{
			var test_path_end = require('shortid').generate();

			publisherclient.set('e2e_test1/testsubscribe/data/' + test_path_end, {property1:'property1',property2:'property2',property3:'property3'}, {noPublish:true}, function(e, insertResult){
			
				expect(e).to.be(null);

				publisherclient.set('e2e_test1/testsubscribe/data/' + test_path_end, {property1:'property1',property2:'property2',property3:'property3', property4:'property4'}, {noPublish:true}, function(e, updateResult){

					expect(e).to.be(null);
					expect(updateResult._id == insertResult._id).to.be(true);
					callback();

				});

			});

		}catch(e){
			callback(e);
		}
	});


	it('should merge tag some test data', function(callback) {

		var randomTag = require('shortid').generate();

		publisherclient.set('e2e_test1/test/tag', {property1:'property1',property2:'property2',property3:'property3'}, {noPublish:true}, function(e, result){

			////////console.log('did set');
			////////console.log([e, result]);

			if (!e){

			publisherclient.set('e2e_test1/test/tag', {property4:'property4'}, {tag:randomTag, merge:true, noPublish:true}, function(e, result){

				if (!e){

					////////console.log('merge tag results');
					////////console.log(e);
					////////console.log(result);

					expect(result.payload[0].snapshot.data.property1).to.be('property1');
					expect(result.payload[0].snapshot.data.property4).to.be('property4');

					publisherclient.get('e2e_test1/test/tag/tags/*', null, function(e, results){

						expect(e).to.be(null);
						expect(results.payload.length > 0).to.be(true);
						
						var found = false;

						results.payload.map(function(tagged){

							if (found)
								return;

							if (tagged.snapshot.tag == randomTag){
								expect(tagged.snapshot.data.property1).to.be('property1');
								expect(tagged.snapshot.data.property4).to.be('property4');
								found = true;
							}
			
						});

						if (!found)
							callback('couldn\'t find the tag snapshot');
						else
							callback();

					});
				}else
					callback(e);

			});

		}
		else
			callback(e);

			
		});

	});



//	We set the listener client to listen for a PUT event according to a path, then we set a value with the publisher client.

	it('the listener should pick up a single published event', function(callback) {
		
		this.timeout(default_timeout);

		try{

			//first listen for the change
			listenerclient.on('/e2e_test1/testsubscribe/data/event', 'PUT', 1, function(e, message){

				expect(listenerclient.events['/PUT@/e2e_test1/testsubscribe/data/event'].length).to.be(0);
				callback(e);

			}, function(e){

				//////console.log('ON HAS HAPPENED: ' + e);

				if (!e){

					expect(listenerclient.events['/PUT@/e2e_test1/testsubscribe/data/event'].length).to.be(1);
					//////console.log('on subscribed, about to publish');

					//then make the change
					publisherclient.set('/e2e_test1/testsubscribe/data/event', {property1:'property1',property2:'property2',property3:'property3'}, null, function(e, result){
						////////////////console.log('put happened - listening for result');
					});
				}else
					callback(e);
			});

		}catch(e){
			callback(e);
		}
	});



	//We are testing setting data at a specific path

	it('the publisher should set new data ', function(callback) {
		
		this.timeout(default_timeout);

		try{
			var test_path_end = require('shortid').generate();

			publisherclient.set('e2e_test1/testsubscribe/data/' + test_path_end, {property1:'property1',property2:'property2',property3:'property3'}, null, function(e, result){
			
				if (!e){
					publisherclient.get('e2e_test1/testsubscribe/data/' + test_path_end, null, function(e, results){
						////////////console.log('new data results');
						////////////console.log(results);
						expect(results.payload.length == 1).to.be(true);
						expect(results.payload[0].data.property1 == 'property1').to.be(true);

						if (mode != 'embedded')
							expect(results.payload[0].created == results.payload[0].modified).to.be(true);

						callback(e);
					});
				}else
					callback(e);
			});

		}catch(e){
			callback(e);
		}
	});



	it('the publisher should set new data then update the data', function(callback) {
		
		this.timeout(default_timeout);

		try{
			var test_path_end = require('shortid').generate();

			publisherclient.set('e2e_test1/testsubscribe/data/' + test_path_end, {property1:'property1',property2:'property2',property3:'property3'}, null, function(e, insertResult){
			
				expect(e == null).to.be(true);

				publisherclient.set('e2e_test1/testsubscribe/data/' + test_path_end, {property1:'property1',property2:'property2',property3:'property3', property4:'property4'}, null, function(e, updateResult){

					expect(e == null).to.be(true);
					expect(updateResult._id == insertResult._id).to.be(true);
					callback();

				});

			});

		}catch(e){
			callback(e);
		}
	});



	it('the publisher should push to a collection and get a child', function(callback) {
		
		this.timeout(default_timeout);

		try{
				var test_path_end = require('shortid').generate();

				publisherclient.setChild('e2e_test1/testsubscribe/data/collection/' + test_path_end, {property1:'post_property1',property2:'post_property2'}, function(e, results){

					if (!e){
						//the child method returns a child in the collection with a specified id
						publisherclient.getChild('e2e_test1/testsubscribe/data/collection/' + test_path_end, results.payload._id, function(e, results){
							expect(results.payload.length == 1).to.be(true);
							callback(e);
						});

					}else
						callback(e);

				});
					

		}catch(e){
			callback(e);
		}
	});

	//We are testing pushing a specific value to a path which will actually become an array in the database

	it('the publisher should push a sibling and get all siblings', function(callback) {
		
		this.timeout(default_timeout);

		try{

			var test_path_end = require('shortid').generate();	

			publisherclient.setSibling('e2e_test1/siblings/' + test_path_end, {property1:'sib_post_property1',property2:'sib_post_property2'}, function(e, results){

				expect(e == null).to.be(true);

				publisherclient.setSibling('e2e_test1/siblings/' + test_path_end, {property1:'sib_post_property1',property2:'sib_post_property2'}, function(e, results){

					expect(e == null).to.be(true);

					//the child method returns a child in the collection with a specified id
					publisherclient.get('e2e_test1/siblings/' + test_path_end + '/*', null, function(e, getresults){
						expect(e == null).to.be(true);
						expect(getresults.payload.length == 2).to.be(true);
						callback(e);
					});
				});
			});

		}catch(e){
			callback(e);
		}
	});



//	We set the listener client to listen for a PUT event according to a path, then we set a value with the publisher client.

	it('the listener should pick up a single published event', function(callback) {
		
		this.timeout(default_timeout);

		try{

			//first listen for the change
			listenerclient.on('/e2e_test1/testsubscribe/data/event', 'PUT', 1, function(e, message){

				expect(listenerclient.events['/PUT@/e2e_test1/testsubscribe/data/event'].length).to.be(0);
				callback(e);

			}, function(e){

				////////////////console.log('ON HAS HAPPENED: ' + e);

				if (!e){

					expect(listenerclient.events['/PUT@/e2e_test1/testsubscribe/data/event'].length).to.be(1);

					////////////////console.log('on subscribed, about to publish');

					//then make the change
					publisherclient.set('/e2e_test1/testsubscribe/data/event', {property1:'property1',property2:'property2',property3:'property3'}, null, function(e, result){
						////////////////console.log('put happened - listening for result');
					});
				}else
					callback(e);
			});

		}catch(e){
			callback(e);
		}
	});



//	We are testing the deletion of data at a set path, and listening for the DELETE event at that path.



	it('should delete a child from an array', function(callback) {
		
		this.timeout(default_timeout);

		try{

				publisherclient.setChild('/e2e_test1/testsubscribe/data/arr_delete_me', {property1:'property1',property2:'property2',property3:'property3'}, function(e, post_result){

					//////////////console.log('post_result');
					//////////////console.log(post_result);

					expect(e == null).to.be(true);

					publisherclient.get('/e2e_test1/testsubscribe/data/arr_delete_me', null, function(e, results){

						expect(e == null).to.be(true);
						expect(results.payload.length).to.be(1);

						publisherclient.removeChild('/e2e_test1/testsubscribe/data/arr_delete_me', post_result.payload._id, function(e, delete_result){

							expect(e == null).to.be(true);

							publisherclient.get('/e2e_test1/testsubscribe/data/arr_delete_me', null, function(e, results){

								expect(e == null).to.be(true);

								var foundChild = false;
								results.payload[0].data.map(function(child){
									if (child._id == post_result.payload._id)
										foundChild = true;
								});

								expect(foundChild).to.be(false);
								callback();

							});
						});
					});
				});

		}catch(e){
			callback(e);
		}
	});



	it('should get using a wildcard', function(callback) {

		var test_path_end = require('shortid').generate();

		publisherclient.set('e2e_test1/testwildcard/' + test_path_end, {property1:'property1',property2:'property2',property3:'property3'}, null, function(e, insertResult){
			expect(e == null).to.be(true);
			publisherclient.set('e2e_test1/testwildcard/' + test_path_end + '/1', {property1:'property1',property2:'property2',property3:'property3'}, null, function(e, insertResult){
				expect(e == null).to.be(true);
			
				publisherclient.get('e2e_test1/testwildcard/' + test_path_end + '*', null, function(e, results){
					
					expect(results.payload.length == 2).to.be(true);

					publisherclient.getPaths('e2e_test1/testwildcard/' + test_path_end + '*', function(e, results){

						expect(results.payload.length == 2).to.be(true);
						callback(e);

					});
				});
			});
		});
	});




	it('should tag some test data', function(callback) {

		var randomTag = require('shortid').generate();

		publisherclient.set('e2e_test1/test/tag', {property1:'property1',property2:'property2',property3:'property3'}, {tag:randomTag}, function(e, result){

			if (!e){
				publisherclient.get('e2e_test1/test/tag/tags/*', null, function(e, results){

					expect(e).to.be(null);
					expect(results.payload.length > 0);

					var found = false;

					results.payload.map(function(tagged){

						if (found)
							return;

						if (tagged.snapshot.tag == randomTag)
							found = true;

					});

					if (!found)
						callback('couldn\'t find the tag snapshot');
					else
						callback();

				});
			}else
				callback(e);
		});

	});	

	

	it('should save by id, then search and get by id, using bsonid property', function(callback) {

		var randomPath = require('shortid').generate();

		publisherclient.set('e2e_test1/test/bsinid/' + randomPath, {property1:'property1',property2:'property2',property3:'property3'}, {}, function(e, setresult){

			if (!e){

				////////////console.log(setresult);

				var searchcriteria = {'_id': {$in: [{bsonid:setresult.payload._id}]}};

				publisherclient.get('e2e_test1/test/bsinid/*' , {criteria:searchcriteria}, function(e, results){

					expect(e).to.be(null);
					////////////console.log(results);
					expect(results.payload.length == 1).to.be(true);
					expect(results.payload[0].data.property1).to.be('property1');

					callback();

				});
			}else
				callback(e);
		});

	});	


	it('should handle sequences of events by writing as soon as possible', function (callback) {

		this.timeout(60000);

		freebase_client.load({config:{host:'localhost', port:testport, secret:test_secret}}, function(e, client){

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


			      //////console.log(receivedCount);
			      //////console.log(sent.length);

			      if (receivedCount == sent.length) {
			        console.timeEnd('timeTest');
			        expect(Object.keys(received).length == expected).to.be(true);
			        //////console.log(received);

			        callback();
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
				      }, {excludeId:1}, function (e, result) {

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
  });


it('should handle sequences of events by when the previous one is done', function (callback) {

    this.timeout(120000);

    freebase_client.load({config:{host:'localhost', port:testport, secret:test_secret}}, function(e, client){

			if (e)
				return callback(e);

			var stressTestClient = client;

			setTimeout(function(){
				
			    var count = 0;
			    var expected=1000;
			    var received = [];

			    var sent = [];
			    for (var i=0;i<expected;i++) {
			      sent.push(i);
			    }

			    //first listen for the change
			    listenerclient.on('/e2e_test1/testsubscribe/sequence1', 'PUT', 0, function (e, message) {

			      ////////console.log('Event happened', message);

			      received.push(message.data.property1);

			      if (received.length == expected) {
			        console.timeEnd('timeTest');
			        expect(received.length).to.be(sent.length);
			     
			        callback();
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
			      }, {excludeId:1}, function (e, result) {
			        writeData();

			      });
			    }


			}, 2000)

		});
  });

	it('should fail to subscribe to an event', function(callback) {

		this.timeout(default_timeout);
		subWasSuccessful = true;

    	freebase_client.load({config:{host:'localhost', port:testport, secret:test_secret}}, function(e, badclient){

    		badclient.onMessage('badclient_test', 'error', function(message){

    			if (message.data.status == 'Authentication failed')
    				subWasSuccessful = false;

    		}, function(e){

    			badclient.token = 'rubbish';
	    		badclient.onAll(function(e, message){

					////console.log('on all happened');

				}, function(e){

					if (e)
						callback(e);
					else {
						setTimeout(function(){

							if (subWasSuccessful)
								callback('unauthorized subscribe was let through');
							else
								callback();

						}, 3000);
					}

				});

    		});

    	});

	});
});