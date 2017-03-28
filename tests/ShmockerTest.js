const TestCase = require('./TestCase'),
	cp = require('child_process'),
  fs = require('fs'),
  path = require('path');

class ShmockerTest extends TestCase {
  shmocker(cmd) {

    const p = path.dirname(path.dirname(__filename));

  	try {
  		return cp.execSync(`node ${p}/js ${cmd}`, {stdio: 'pipe'}).toString().trim();
  	} catch(e) {
  		return false;
  	}
  }

  id()
  {
  	return 'test' + Math.floor(Math.random() * 0xffff + 0x10000).toString(16);
  }

	testExists() {
		this.check(this.shmocker('help') === false, 'Shmocker exists');
		this.check(/^Shmocker JS version/.exec(this.shmocker('version')) , 'Shmocker shows version');
	}

	testImages() {
		const imgs = this.shmocker('images').split("\n");
		this.check(imgs.length > 1, 'Shmocker shows some images');

		const imgsq = this.shmocker('images -q').split("\n");
		this.check(imgsq.length = imgs.length-1, 'images -q works');

		const json = this.shmocker('images --json');
		this.check(typeof JSON.parse(json) == 'object', 'images --json works');

		this.check(this.shmocker('images freebsd') !== false, 'Shmocker has freebsd image');
	}

	testContainers()
	{
		const ps = this.shmocker('ps');
		this.check(ps == false, "Shows no containers");

		const name = this.id();

		const id = this.shmocker(`create -n ${name} freebsd sh`);
		this.check(id != false, "Can create containers");

    this.check(this.shmocker(`create -n ${name} freebsd sh`) == false, 'Cant create two containers with same name');

		const info = this.shmocker(`ps -a ${name}`);
		this.check(info !== false, "Shows new container as stopped");

		this.shmocker(`rm ${name}`);
		this.check(this.shmocker(`ps -a ${name}`) == false, 'Can remove container by name');

    const id2 = this.shmocker('create freebsd sh');
    this.check(id2, 'Can create anonymous container');

    const json = JSON.parse(this.shmocker('ps -a --json'));
    this.check(json.filter(i => i.id == id2).length > 0, 'ps --json works');
	}

  testWipe()
  {
    this.shmocker('create freebsd sh');
    this.shmocker('wipe');

    this.check(this.shmocker('ps -a') == false, 'Wipe works');
  }

  testExportImport()
  {
    const id = this.id();

    let res = this.shmocker(`export freebsd > /tmp/${id}`);
    this.check(res !== false, 'Can export image to tar');

    res = this.shmocker(`import /tmp/${id} ${id}`);
    this.check(res, 'Can import image from tar');

    const info = this.shmocker(`images -q ${id}`).split("\n");
    this.check(info.length > 0, 'Imported images shown in list');

    // we need to save/load imported image since it isnt bound to any parent image
    res = this.shmocker(`save ${id} > /tmp/${id}`);
    this.check(res !== false, 'Export works');

    this.check(this.shmocker(`rmi ${id}`), 'Can remove imported image');
    this.check(this.shmocker(`images -a ${id}`) === false, 'Image removed ok');

    res = this.shmocker(`load < /tmp/${id}`);
    this.check(res, 'Load works');

    this.check(this.shmocker(`images -q ${res}`), 'Image loaded ok');
    this.check(this.shmocker(`rmi ${res}`), 'Can remove loaded image');

    fs.unlinkSync(`/tmp/${id}`);
  }

  testCommit()
  {
    const name = this.id();

    const id = this.shmocker('create freebsd sh');
    this.check(id, 'Can create container');

    const imgid = this.shmocker(`commit ${id} ${name}`).split("\n").pop();

    this.check(this.shmocker(`images -q ${name}`).split('\n').length > 0, 'Can see committed by name');
    this.check(this.shmocker(`images -q ${imgid}`).split('\n').length > 0, 'Can see committed by id');

    this.check(this.shmocker(`rmi ${imgid}`), 'Can remove committed image');
  }

  testTag()
  {
    const id = this.shmocker('create freebsd sh');
    this.check(id, 'Can create container');

    const imgid = this.shmocker(`commit ${id}`);

    const name = this.id();

    this.check(this.shmocker(`tag ${imgid} ${name}_1`), 'Can tag image');
    this.check(this.shmocker(`tag ${imgid} ${name}_2`), 'Can tag image');
    this.check(this.shmocker(`tag ${imgid} ${name}_3`), 'Can tag image');

    const lines = this.shmocker(`images -q ${imgid}`).split("\n");
    this.check(lines.length == 3, 'Image can be tagged multiple times');

    this.check(this.shmocker(`rmi ${imgid}`), 'Rm works');

    this.check(this.shmocker(`images ${imgid}`) === false, 'Can remove multiple images by id');
  }

  testTagIntermediate()
  {
    const id = this.id();

    const c1 = this.shmocker('create freebsd sh');
    const i1 = this.shmocker(`commit ${c1}`);
    const c2 = this.shmocker(`create ${i1} sh`);

    this.check(c1 && i1 && c2, 'Can create chain of images');

    this.check(this.shmocker(`images ${i1}`) == false, 'Intermediate image not shown');
    this.check(this.shmocker(`images -a ${i1}`) !== false, 'Intermediate image shown in images -a');

    this.check(this.shmocker(`tag ${i1} ${id}`), 'Can tag deleted image');
    this.check(this.shmocker(`images ${i1}`), 'Intermediate image shown');

    this.shmocker(`rm ${c2} ${c1}`);
    this.shmocker(`rmi ${i1}`);
  }

  testRename()
  {
    const name1 = this.id();
    const name2 = this.id();

    const id = this.shmocker(`create freebsd sh`);

    this.check(this.shmocker(`rename ${id} ${name1}`), 'Can rename container by id');
    this.check(this.shmocker(`ps -a ${name1}`) !== false, 'Container new name is shown');

    this.check(this.shmocker(`rename ${name1} ${name2}`), 'Can rename container by id');
    this.check(this.shmocker(`ps -a ${name2}`) !== false, 'Container new name is shown');
    this.check(this.shmocker(`ps -a ${name1}`) == false, 'Container old name is shown');

    this.shmocker(`rm ${id}`);
  }

  testCpDiff()
  {
    const name = this.id();

    const id = this.shmocker(`create freebsd sh`);

    this.check(this.shmocker(`cp ${id}:/COPYRIGHT /tmp/${name}`) !== false, 'Can copy files from container');
    this.check(this.shmocker(`cp /tmp/${name} ${id}:/${name}.new`) !== false, 'Can copy files to container');

    let lines = this.shmocker(`diff ${id}`).split("\n").filter(line => line.search('.new') !== false);
    this.check(lines.length > 0, 'Diff shows changed files for container');

    this.shmocker(`commit ${id} ${name}`);

    // NOTE: after the commit all diff moves to new image and the container becomes a child of the newly created image
    lines = this.shmocker(`diff ${name}`).split("\n").filter(line => line.search('.new') !== false);
    this.check(lines.length > 0, 'Diff shows changed files for image');

    this.shmocker(`rm ${id}`);
    this.shmocker(`rmi ${name}`);
  }

  testRunSimple()
  {
    const name = this.id();
    const out = this.shmocker(`run -n ${name} freebsd whoami`);
    this.check(out.trim() == "root", "Can run container");
    this.check(this.shmocker(`ps -a ${name}`), 'Container not removed');

    this.check(this.shmocker(`run --rm -n ${name}_rm freebsd whoami`).trim() == "root", "Can run container");
    this.check(this.shmocker(`ps -a ${name}_rm`) == false, 'Container with --rm is removed');

    this.check(this.shmocker(`start ${name}`).trim() == 'root', 'Can restart stopped container');

    this.shmocker(`rm ${name}`);
  }

  testNamedVolumes()
  {
    const name = this.id();
    const id = this.shmocker(`volume create -n ${name}`);

    this.check(id, 'Can create volume');

    this.check(this.shmocker(`volume ls ${name}`) !== false, 'Volume created');
    this.check(this.shmocker(`volume ls -q ${name}`).split("\n").length == 1, 'Volume -q works');

    // TODO: volume json

    this.check(this.shmocker(`volume rm ${name}`), 'Can remove volume');
    this.check(this.shmocker(`volume ls ${name}`) == false, 'Volume removed');
  }

  testRunVolume()
  {
    const name = this.id();

    fs.writeFileSync(`/tmp/${name}`, name);
    let res = this.shmocker(`run --rm -v /tmp:/src freebsd cat /src/${name}`);

    this.check(res == name, 'Volumes work');

    res = this.shmocker(`run --rm -v /tmp:/src:ro freebsd 'echo 123 > /src/${name}'`);
    this.check(res === false, 'Cant write to readonly volume');

    res = this.shmocker(`run --rm -v /tmp:/src freebsd 'echo 123 > /src/${name}'`);
    this.check(res !== false, 'Can write to volume');

    this.check(fs.readFileSync(`/tmp/${name}`).toString().trim() == '123', 'Can write to volume file');

    // FIXME: check -v not triggers an exception when pointer to a file (instead of dir)

    // TODO: volume init
    // TODO: named volumes
  }

  // TODO: volumes-from

  // build
  // bootstrap

  // run [-v] [-n] [-d] [-p] named volumes

  // start
  // stop
  // kill

  // wait
}

module.exports = ShmockerTest;