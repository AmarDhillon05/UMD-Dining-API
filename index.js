import puppeteer from 'puppeteer-core';
import chrome from "chrome-aws-lambda"
import fs from "fs"
import express from "express";
import cron from "node-cron"
import cors from 'cors'

//JSON file path
const jsonFilePath = process.cwd() + "/tmp/data.json"
console.log("JSON EXISTS: ")
console.log(fs.existsSync(jsonFilePath))


async function scrape(){ 
    //Initializing scarper
    const options = {
        args: [...chrome.args, "--hide-scrollbars", "--disable-web-security"],
        defaultViewport: chrome.defaultViewport,
        executablePath: await chrome.executablePath,
        headless: true,
        ignoreHTTPSErrors: true,
    }
    const puppet = await puppeteer.launch(options);

    //links as data
    let return_data = {
        last_updated: new Date().toDateString(),
        Y: {
            name: "Yahentamitsi",
            link: "https://nutrition.umd.edu/?locationNum=19"
        },
        North: {
            name: "251 North",
            link: "https://nutrition.umd.edu/?locationNum=51"
        },
        South: {
            name: "South Campus Dining",
            link: "https://nutrition.umd.edu/?locationNum=16"
        }
    }

    //List of macros to accumulate into return_data
    let macros = []

    try{
        //Requesting from each dining hall
        for(const dining_hall in return_data){
            const link = return_data[dining_hall].link

            //Parsing
            let page = await puppet.newPage()
            await page.goto(link, {
                waitUntil: "domcontentloaded",
            })

            
            

            //Main scraper function
            async function get_page_content(){
                return await page.evaluate(() => {
                    let sections = {}
                    let links = {}
                    Array.from(document.getElementsByClassName("card")).forEach(card => {
                        let title = card.getElementsByClassName("card-title")[0].innerHTML
                        sections[title] = {}
                        Array.from(card.getElementsByClassName("menu-item-row")).forEach(item => {
                            let item_name = card.getElementsByClassName("menu-item-name")[0].innerHTML
                            let link = card.getElementsByClassName("menu-item-name")[0].href
                            links[item_name] = link
                            let tags = []
                            Array.from(item.getElementsByTagName("img")).forEach(img => {
                                tags.push(img.alt)
                            })
                            sections[title][item_name] = tags
                            sections[title][item_name][link] = link
                        })
                    })

                    return [sections, links]
                });
            }
            

            //Doing this for all the Nav links
            let nav_links = await page.evaluate(() => {
                return Array.from(document.getElementsByClassName("nav-link")).map(link => ({
                    id: link.id,
                    name: link.innerHTML
                }));
            });
        
            for(const link of nav_links){
                await page.locator("#" + link.id).click()
                let all = await get_page_content()
                let content = all[0];
                let nutrition_link = all[1];
                return_data[dining_hall][link.name] = content
                macros.push(nutrition_link)
            }
        }



        //Now getting macros for each link
        return_data['macros'] = {}
        let page = await puppet.newPage()

        async function get_nutrition(){
            return await page.evaluate(() => {
                let nutrition_facts = {}

                //Serving size
                let header = document.getElementsByTagName("td")[0]
                for(const el of Array.from(header.getElementsByTagName("p"))){
                    if(el.innerHTML != "Calories per serving"){
                        nutrition_facts['cals_per_serving'] = el.innerHTML
                        break
                    }
                }
                

                //Macros
                let factors = document.getElementsByClassName("nutfactstopnutrient")
                Array.from(factors).forEach(el => {
                    let innerHTML = el.innerHTML.replace("<b>", "").replace("<i>", "")
                    innerHTML = innerHTML.replace("</b>", "").replace("</i>", "").replace("&nbsp", "")
                    if(!innerHTML.includes("%") && !(innerHTML == "")){
                        let sep = innerHTML.split(";")
                        nutrition_facts[sep[0]] = sep[1]
                    }
                })

                return nutrition_facts
       
            })
        }

        //Updating return_data[macros]
        for(const macro_set of macros){
            let macro_set_keys = Object.keys(macro_set)
            for(const key of macro_set_keys){
                await page.goto(macro_set[key], {
                    waitUntil: "domcontentloaded",
                })
                return_data['macros'][key] = await get_nutrition()
            }
        }


        await puppet.close()
        
        return JSON.stringify(return_data)
    }
    catch(error){
        console.log("Scraping Error: ")
        console.log(error)
        return JSON.stringify({"error" : error})
    }
}


//Updater
cron.schedule('0 */8 * * *', () => {
    scrape().then(data => {
        fs.writeFileSync(jsonFilePath, data)
        console.log("File updated")
    })
  }, {
    scheduled: true,
    timezone: "America/New_York" // Set your desired timezone
  });



//app
const app = express()

//Allowing cors
app.use(cors({
  origin: "*", // Replace with frontend domain if needed
  methods: "GET,POST,PUT,DELETE,OPTIONS",
  allowedHeaders: "Content-Type,Authorization"
}));

app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.status(200).end();
});


app.get('/', (req, res) => {
    console.log("Got a get request")

    //Returning file data
    const data = fs.readFileSync(jsonFilePath, 'utf-8')
    res.send(data)

})


//Run
//First creating file
scrape().then(data => {
    fs.writeFileSync(jsonFilePath, data)
    const port = 9000
    app.listen(port, () => {
        console.log(`TerpMeals API listening on port ${port}`);
      });
})
