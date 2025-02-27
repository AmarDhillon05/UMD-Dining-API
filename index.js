import puppeteer from 'puppeteer-core';
import chrome from "chrome-aws-lambda"
import fs from "fs"
import express from "express";
import cron from "node-cron"
import cors from 'cors'

//Scraping function
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

    try{
        //Requesting from each dining hall
        for(const dining_hall in return_data){
            const link = return_data[dining_hall].link

            //Parsing
            const page = await puppet.newPage()
            await page.goto(link, {
                waitUntil: "domcontentloaded",
            })

            const brunch = await page.evaluate(() => {
                console.log('getting brunch')
                let sections = {}
                Array.from(document.getElementsByClassName("card")).forEach(card => {
                    let title = card.getElementsByClassName("card-title")[0].innerHTML
                    sections[title] = {}
                    Array.from(card.getElementsByClassName("menu-item-row")).forEach(item => {
                        let item_name = card.getElementsByClassName("menu-item-name")[0].innerHTML
                        let tags = []
                        Array.from(item.getElementsByTagName("img")).forEach(img => {
                            tags.push(img.alt)
                        })
                        sections[title][item_name] = tags
                    })
                })

                return sections
            });
            
            await page.locator("#tab-2").click()

            const dinner = await page.evaluate(() => {
                console.log("getting dinner")
                let sections = {}
                Array.from(document.getElementsByClassName("card")).forEach(card => {
                    let title = card.getElementsByClassName("card-title")[0].innerHTML
                    sections[title] = {}
                    Array.from(card.getElementsByClassName("menu-item-row")).forEach(item => {
                        let item_name = card.getElementsByClassName("menu-item-name")[0].innerHTML
                        let tags = []
                        Array.from(item.getElementsByTagName("img")).forEach(img => {
                            tags.push(img.alt)
                        })
                        sections[title][item_name] = tags
                    })
                })

                return sections
            });
            

            return_data[dining_hall].brunch = brunch
            return_data[dining_hall].dinner = dinner
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


//First creating file
scrape().then(data => {
    fs.writeFileSync("tmp/data.json", data)
})

//Updater
cron.schedule('0 */8 * * *', () => {
    scrape().then(data => {
        fs.writeFileSync("tmp/data.json", data)
        console.log("File updated")
    })
  }, {
    scheduled: true,
    timezone: "America/New_York" // Set your desired timezone
  });



//app
const app = express()
app.use(cors())

app.get('/', (req, res) => {
    console.log("Got a get request")

    //Returning file data
    const data = fs.readFileSync("tmp/data.json", 'utf-8')
    res.send(data)

})


//Run
const port = 9000
app.listen(port, () => {
    console.log(`TerpMeals API listening on port ${port}`);
  });
