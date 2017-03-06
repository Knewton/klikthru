'use strict';

const {Builder, By, Key, promise, until} = require('selenium-webdriver');
var fs = require('fs'); 
var _ = require('underscore');

var cfg = require('./config.json');

function screenshot(driver, x) {
	driver.takeScreenshot().then(
    function(image, err) {
        fs.writeFile('page_' + x + '.png', image, 'base64', function(err) {
        });
    }
	);
}

function interactWithItem(driver, correct) {
	var interacted = false; 

	// instruction
	driver.findElements(By.className('atom-instruction')).then(function (found) {
		if (found.length > 0) {
			console.log("[IA] skipping..."); 
			driver.findElements(By.className('continue-link')).then(function (found) {
				if (found.length > 0) {
					found[0].click();
				}
			}); 
		}
	});

	driver.wait(until.elementLocated(By.className('submit-button')), 2000);

	// answer free response
	driver.findElements(By.className("wrs_focusElement")).then(function (found) { 
		if (found.length > 0) { 
			console.log("[FR] answering...");
			if (correct) {
				found[0].sendKeys(Key.chord(Key.ALT, "c"));
			} else {
				found[0].sendKeys('definitely wrong answer');
			}
			driver.sleep(500);
			driver.findElement(By.className('submit-button')).click();
			interacted = true;
		}
	});

	// answer multiple choice
	driver.findElements(By.xpath("//form[contains(@class, 'question-answers')]/label[contains(@class, 'question-input')]"))
		.then(function (found) {
			if (found.length > 0) {
				console.log("[MC] answering...");
				if (correct) {
					driver.findElement(By.css('body')).sendKeys(Key.chord(Key.ALT, "c")); // need admin account for this to work
				} else {
					found[0].click();
				}
				driver.sleep(500);
				driver.findElement(By.className('submit-button')).click();
				interacted = true;
			}
	});
		
	return interacted;
}

function waitTillLoaded(driver, x) {
	driver.wait(function() {
		return driver.executeScript("return document.readyState == 'complete'").then(function(return_value) {
    	console.log('loaded page:', x);
    	driver.sleep(3000); // let animations load
			screenshot(driver, x); 
    	return return_value;
		});
	}, 5000);
}

_.each(cfg.demo.users, function (user) {
	console.log("Klikthru as: " + user.username);

	promise.consume(function* () {
		let driver;

		try {
	  	driver = new Builder().forBrowser('chrome').build();
			yield driver.manage().window().setSize(1920, 1080);

			yield driver.get('https://www.knewton.com/login/');
			yield driver.wait(until.titleContains('Knewton'), 1000);
			yield driver.findElement(By.name('username')).sendKeys(user.username); 
			yield driver.findElement(By.name('password')).sendKeys(user.password);
			yield driver.findElement(By.name('login')).click(); 

			if (user.type == "learner") {
				yield driver.wait(until.titleContains('Learn'), 5000);
				
				yield driver.wait(until.elementLocated(By.xpath("//span[contains(@class, 'name') and text() = '" 
					+ user.assignment.name + "']")), 2000);

				screenshot(driver, '00_assignment_list');

				yield driver.wait(until.elementLocated(By.xpath("//span[contains(@class, 'name') and text() = '" 
					+ user.assignment.name + "']")), 2000).click();
				waitTillLoaded(driver, '01_assignment_cover');

				yield driver.findElement(By.className('start-button')).click(); 
				waitTillLoaded(driver, 0);

				// run item by item interactions
				var index = 0;
				var stuck_done = false;
				while (index < user.assignment.responses.length) {
					// TODO: check done

					// do one stuck sequence
					if (!stuck_done) {
						yield driver.findElements(By.className('need-help')).then(function (elems) {
							if (elems.length > 0) {
								console.log("[  ] stuck..."); 
								driver.findElement(By.className('need-help')).click(); 
								waitTillLoaded(driver, index + "_stuck_popup");
								driver.sleep(500);
								driver.wait(until.elementLocated(By.className('need-help-button')), 2000).click(); 
								waitTillLoaded(driver, index + "_stuck_instruction");
								stuck_done = true;
							}
						});
					}

					interactWithItem(driver, user.assignment.responses[index]);
					waitTillLoaded(driver, index + "_explanation");
					yield driver.wait(until.elementLocated(By.className('continue-button')), 2000).click();
					waitTillLoaded(driver, index + 1);
					index = index + 1;
				}	
			} else if (user.type == "instructor") {
				yield driver.wait(until.titleContains('Teach'), 5000);

				yield driver.wait(until.elementLocated(By.xpath("//a[text() = 'Intermediate Algebra']")), 1000);
				yield driver.findElement(By.xpath("//a[text() = 'Intermediate Algebra']")).click();
			}
		} finally {
			yield driver && driver.quit();
		}
	}).then(_ => console.log('SUCCESS'), err => console.error('ERROR: ' + err));
}, this); 

