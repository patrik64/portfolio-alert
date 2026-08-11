Create a sveltekit application using remult and supabase (the supabase postgres instance is set up and running, the credentials are availabvle in .env file).
The application will provide information about companies that are supported by various hedge funds and private equity funds and the input data will be fetched 
using already available scrapper scripts located in the "scrapa" subfolder. Each typescript file represents a hegde fund or the equity fund.
The UI should have several pages:
- a main dashboard with the list of all supported hedge funds or equity funds respresented by a card + button that will run all the scrapper scripts and fetch all the data
- a page with a detailed list of all companies for each hedge fund or equity fund
- a page with newcomers only, i.e. after pressing the fetch/refresh button from the main page, it should only list all the new companies that are not already in the database (grouped by the hedge fund or equity fund).
To help set up the application, take a look at the "tres-palabras" project in the neighboring folder (it also uses supabase and remult) and feel free to use the same css styling.
