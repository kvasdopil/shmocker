class TestCase {
	check(e, desc) {
		process.stdout.write('.');
		if(!e)
			throw `Failed: ${desc}`;
	}

  run() {
    const methods = Object.getOwnPropertyNames(this.__proto__).filter(name => /^test/.test(name));

    let success = true;

    for(const method of methods)
      try {
        process.stdout.write(method);
        this[method].call(this);
        console.log('PASS');
      } catch(e) {
        success = false;
        console.error('FAIL');
        console.error(e);
      }

    if(success)
      console.log("ALL TESTS PASSED");
    else
      console.error("TESTS FAILED");

  }
}

module.exports = TestCase;
