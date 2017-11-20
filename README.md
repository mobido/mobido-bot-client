# mobido-bot-client
Library for communicating with the Mobido server and other bot servers

## Creating your first bot

1. Using the Mobido iOS client
	a. Create a persona for testing
	b. Create your bot persona ending in 'Bot', such as 'DemoBot'.  Be sure to capitalize the 'B' in bot.
	c. From the list of all your personas, long press on your new bot
	d. Tap 'Enter Beta'
	e. Make sure your Mobido account has a login and password - if not tap the 'More' tab and create a login and change your password.
4. From the node project directory, execute the Mobido setup script:
	$ node node_modules/mobido-bot-client/setup demobot
5. Deploy your node project so the /a/demo/manifest.json file is available
6. Using the Mobido iOS client
	a. From the list of all your personas, long press on your new bot
	b. Tap 'Metapage URL', and enter the URL of the manifest.json, such as http://yourdomain.com/a/demo/manifest.json
	

