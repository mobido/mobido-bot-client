# mobido-bot-client
Library for communicating with the Mobido server and other bot servers

## Creating your first bot

1. Using the Mobido iOS client
	a. Create a persona for testing
	b. Create your bot persona ending in 'Bot', such as 'DemoBot'.  Be sure to capitalize the 'B' in bot.
2. Make sure your new bot is public.  Ask a Mobido admin to add your card into the 'beta' market category.
3. Make sure your Mobido account has a login and password - if not tap the 'More' tab and create a login and change your password.
4. From the node project directory, execute the Mobido setup script:
	$ node node_modules/mobido-bot-client/setup demobot
