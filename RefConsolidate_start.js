// Make sure the document is ready and dependencies are loaded
$.when (
	$.ready,
	mw.loader.using(['mediawiki.util'])
	).done(function () {
		// Only load on appropriate namespaces
		var namespace = mw.config.get( 'wgNamespaceNumber' );
		if ( namespace === 0 || namespace === 2 ) {
			// Only load when editing wikitext (and not in common.js or common.css, for example)
			var contentModel = mw.config.get( 'wgPageContentModel' );
			if ( contentModel === 'wikitext' ) {				
				// Configure the gadget for this particular wiki
				mw.config.set({
					'refcon-summary': 'Koondasin skripti abil viited', // Edit summary automatically added by ProveIt
					'refcon-summaryseparator': ' + ', // Edit summary separator if summary is added to existing summary
					'refcon-linkname': 'V-koonda', //Portlet link name
					'refcon-linkhover': 'Koonda viited', //Text that is displayed when hovering above the link; link title
					'refcon-reftemplatenames': [ //List template {{reflist}} name and aliases that are used in wiki. Put main first
						'viited',
						'reflist'
					],
					'refcon-reftemplategroupnames': [ //List template {{reflist}} 'group' parameter aliases that are used in wiki. Put main first
						'grupp',
						'group'
					],
					'refcon-reftemplaterefsnames': [ //List template {{reflist}} 'refs' parameter aliases that are used in wiki. Put main first
						'allikad',
						'refs'
					],
					'refcon-sortrefs': 'user',	// Whether references will be sorted alphabetically in reference template.
												// Value can be 'yes', 'no', 'user'
					'refcon-usetemplateR': 'no'	// Whether to use template {{R}} for citations. See [[:en:Template:R]].
													// Value can be 'yes', 'no', 'user'
				});
				mw.messages.set({
					'refcon-parsereferror': "See viitestring tekitas vea:\n$1"
				});
				// cache loaded scripts for faster loading
				$.ajaxSetup({
					cache: true
				});
				// load xmlToJSON
				$.getScript( "https://localhost/xmlToJSON.min.js", function() {
					// load the main script
					mw.loader.load('https://localhost/RefConsolidate.js', 'text/javascript');
				});
			}
		}
	}
);