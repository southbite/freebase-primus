module.exports = {
	"client":require('./client/loader'),
	"service":require('./service'),
	"client_plugins":{
		"intra_process":require('./client/plugins/intra-process')
	}
}