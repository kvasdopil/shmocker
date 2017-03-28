const cp = require('child_process'),
      Path = require('path'),
      fs = require('fs'),
      Util = require('./Util'),
      Item = require('./Item');

let kldloaded = false;

class Container extends Item {
  constructor(server, id)
  {
    super(server, id);

    this.zpath = `${this.path}/jails/${id}`;
  }

  mount()
  {
    try {
      fs.mkdirSync(this.mountpoint);
    } catch(e) {}

    cp.execSync(`mount -t zfs ${this.zpath} ${this.mountpoint}`);
  }

  umount()
  {
    const mounts = [].concat(
      this.getMounts(),
      this.getVolumes()
    );

    for(const i of [1,2,3,4,5])
    {
      let ok = true;
      for(const m in mounts)
        try {
          //console.log('um', mounts[m]);
          cp.execSync(`umount ${mounts[m]}`);
          delete mounts[m];
        } catch(e) {
          ok = false;
        }

      if(!ok)
        cp.execSync('sleep 1');
    }

    for(const m in mounts)
      try {
        //console.log('um -f ', mounts[m]);
        cp.execSync(`umount -f ${mounts[m]}`);
        delete mounts[m];
      } catch(e) {}
  }

  getMounts()
  {
    let result = [];
    const re = new RegExp(`^${this.mountpoint}`)

    return this.getAllMounts().filter(m => re.test(m[1])).map(m => m[1]);
  }

  getVolumes()
  {
    let result = [];
    const mounts = this.getAllMounts();

    for(const vol of this.server.listVolumes())
    {
      let me = false;
      let notme = false;

      const re = new RegExp(`^${this.mountpoint}/`);
      for(const mount of mounts)
        if(vol.mountpoint == mount[0]) // volume mounted somewhere
        {
          if(re.test(mount[1])) // volume mounted in this container
            me = true;
          else
            notme = true;
        }

      if(me && !notme)
        result.push(vol.mountpoint);
    }

    return result;
  }

  remove()
  {
    this.umount();

    cp.execSync(`zfs destroy ${this.zpath}`);

    try {
      fs.rmdirSync(this.mountpoint);
    } catch(e) {}

    this.server.storage.removePurged();
  }

  rename(name)
  {
    cp.execSync(`zfs set shmocker:name=${Util.escapeshellarg(name)} ${this.zpath}`);

    this.server.storage.invalidateProps();
  }

  getStatus()
  {
    try {
      const jls = cp.execSync(`jls -N -j ${this.id}`, {stdio: 'pipe'}).toString().trim().split("\n");
      return (jls.length > 1); // first line is headers
    } catch(e) {
      return false;
    }
  }

  getIp()
  {
    const rand = (a, b) => Math.floor(Math.random() * (b - a) + a);

    return `172.77.77.${rand(2,100)}`;
  }

  create(image, cmd, options)
  {
    let ip = options.ip;
    if(ip === undefined)
      ip = this.getIp();

    // inherite environment from image
    const env = this.prop("shmocker:env");
    let run = this.prop("shmocker:cmd");

    // apply given cmd or use inherited one
    if(cmd.length)
      cmd = cmd.join(" ");
    else
      cmd = run;

    let opt = {
      created: Math.floor(+ new Date() / 1000),
      ip:      ip,
      cmd:     cmd,
      origin:  image,
      env:     [],
      ports:   [],
    };

    if(options.hostname !== undefined)
      opt.hostname = options.hostname;

    if(run == false)
      run = "sh"; // default cmd

    if(env != false)
      for(let n in env)
        opt.env[n] = env[n];

    if(options.env)
      for(let n in options.env)
        opt.env[n] = options.env[n];

    if(options.ports)
      for(let v of options.ports)
        opt.ports.push(`${v.src}:${v.dst}`);

    if(options.remove)
      opt.remove = 1;

    cp.execSync(
      "zfs clone" +
      " -o mountpoint=legacy " +
      Util.fmtOptions(opt) +
      ` ${image.zpath}@ok ${this.zpath}`
    );

    this.server.storage.invalidateProps();
  }

  load()
  {
    const id = this.id;

    this.name    = this.prop("shmocker:name");
    this.image   = this.getOrigin();
    this.created = parseInt(this.prop("shmocker:created"));
    this.cmd     = this.prop("shmocker:cmd");
    this.ip      = this.prop("shmocker:ip");
    this.ports   = this.prop("shmocker:ports");
    this.running = this.getStatus();
    this.removed = (this.prop("shmocker:remove") == "1");
  }

  listOphrans()
  {
    let lines = cp.execSync(`ps ax -o pid,ppid -J ${this.id}`).toString().trim().split("\n").map(line => line.split(/[ \t]+/));
    let parents = {};
    let result = [];

    lines.shift(); // remove headers
    for(let line of lines)
      parents[line[0]] = line[1];

    for(let pid in parents)
      if(parents[parents[pid]] === undefined)
        result.push(pid);

    return result;
  }

  kill(signal = false)
  {
    const pids = this.listOphrans();

    if(pids.length == 0)
      return false;

    if(signal !== false)
      signal = `-SIG${signal}`;
     else
      signal = '';

    for(let pid of pids)
      try {
        cp.execSync(`kill ${signal} ${pid}`);
      } catch(e) {}

    return true;
  }

  copyTo(src, dst)
  {
    if(!this.running)
      this.mount();

    try {
      cp.execSync(`cp -rv ${src} ${this.mountpoint}/${dst}`, {stdio: 'inherit'});
    } catch(e) {}

    if(!this.running)
      this.umount();
  }

  copyFrom(src, dst)
  {
    if(!this.running)
      this.mount();

    try {
      cp.execSync(`cp -rv ${this.mountpoint}/${src} ${dst}`, {stdio: 'inherit'});
    } catch(e) {}

    if(!this.running)
      this.umount();
  }

  diff(id)
  {
    // FIXME: this is ugly, keep that until rewritten into deamon
    const root = this.path;

    const parent = this.getOrigin();
    let diff = [];

    try {
      fs.mkdirSync(this.mountpoint);
    } catch(e) {}

    try{
      fs.mkdirSync(`/mnt/${parent}`);
    } catch(e) {}

    try {
      cp.execSync(`mount -t zfs -oro ${root}/images/${parent} /mnt/${parent}`);
    } catch(e) {}

    try{
      cp.execSync(`mount -t zfs -oro ${this.zpath} ${this.mountpoint}`);
    } catch(e) {}

    try {
      diff = cp.execSync(`zfs diff ${root}/images/${parent}@ok ${this.zpath}`).toString().trim().split("\n");
    } catch(e) {}

    try {
      cp.execSync(`umount ${this.mountpoint}`);
    } catch(e) {}

    try {
      cp.execSync(`umount /mnt/${parent}`);
    } catch(e) {}

    try {
      fs.rmdirSync(this.mountpoint);
    } catch(e) {}

    try {
      fs.rmdirSync(`/mnt/${parent}`);
    } catch(e) {}

    return diff;
  }

  commit(img, options)
  {
    let opt = {
      created: Math.floor(+ new Date / 1000),
      env:     [],
    };

    // preserve cmd
    let cmd = this.prop("shmocker:cmd");
    const origin = this.prop("shmocker:origin");

    if(options.cmd)
      cmd = options.cmd;

    if(cmd != false)
      opt.cmd = cmd;

    if(origin != false)
      opt.origin = origin;

    if(options.env)
      for(const n in options.env)
        opt.env.push(options.env[n]); // FIXME: env names abandoned?

    cp.execSync(`zfs snapshot ${this.zpath}@ok`);
    cp.execSync(`zfs clone ${Util.fmtOptions(opt)} ${this.zpath}@ok ${img.zpath}`);
    cp.execSync(`zfs promote ${img.zpath}`);

    this.server.storage.invalidateProps();
  }

  //===

  getAllMounts()
  {
    let result = cp.execSync('mount -p').toString().trim().split("\n").map(line => line.split(/[ \t]+/));
    result.reverse();

    return result;
  }

  loadKld()
  {
    if(!kldloaded)
    {
      try {
        cp.execSync("kldload -n nullfs");
      } catch(e) {}
      kldloaded = true;
    }
  }

  mountNamedVolume(mount)
  {
    // path = this.getPath();
    // if(count(this.getMountsForContainer(id)) == 0) // volume not yet mounted
    // {
    //   @mkdir("/mnt/id");
    //   shell_exec("mount -t zfs path/vol/id /mnt/id");
    // }

    // return "/mnt/id";
  }

  mountVolume(src, dst, mode)
  {
    this.loadKld();

    // create mountpoint if not exist
    try {
      cp.execSync(`mkdir -p ${this.mountpoint}/${dst}`);
    } catch(e) {}

    if(mode == "ro")
      mode = "-oro";
    else
      mode = "";

    if((src[0] == ".") || (src[0] == "/")) // absolute or relative path - use bind volume
    {
      if(!Util.isDir(src)) // perform an initial volume copy
        if(mode == "ro")
          fs.mkdirSync(src);
        else
          cp.execSync(`cp -rp ${this.mountpoint}/${dst} ${src}`); // FIXME: use tar instead
    }
    else // use named volume
    {
      // let vol = this.server.findVolume(src);
      // if(vol === false)
      // {
      //   vol = this.server.createVolume();
      //   vol.rename(src);
      // }

//       this.mountNamedVolume(vol); // FIXME: init dir on first run

//       if(vol === false)
//       {
//         shell_exec("cp -rp this.mountpoint/{vol['dst']}/* src/"); // FIXME: use tar instead, preserve dir permissions
//         st = stat("this.mountpoint/{vol['dst']}");
//         chown(src, st['uid']);
//         chgrp(src, st['gid']);
//         chmod(src, st['mode']);
//       }
    }

    cp.execSync(`mount -t nullfs ${mode} ${src} ${this.mountpoint}/${dst}`);
  }

  buildJailConf()
  {
    const ip     = this.prop("shmocker:ip");
    const cmd    = this.prop("shmocker:cmd");
    let hostname = this.prop("shmocker:hostname");

    if(hostname == false)
      hostname = this.id;

    let env = this.prop("shmocker:env");

    if(env == '-')
      env = [];

    if(env)
      for(const n in env)
        cmd = `export ${Util.escapeshellarg(n)}=${Util.escapeshellarg(env[n])}; ${cmd}`;

    const data = [
      `exec.start = "${cmd}";`,
      `exec.stop  = "/bin/sh /etc/rc.shutdown";`,
      `exec.clean;`,
      `mount.devfs;`,
      `allow.raw_sockets;`,
      ``,
      `path = "${this.mountpoint}";`,
      ``,
      `${this.id} {`,
      `  host.hostname = "${hostname}";`,
      `  interface = "lo1";`,
      `  ip4.addr = "${ip}";`,
      `}`,
    ];
    fs.writeFileSync(`/tmp/jail${this.id}.conf`, data.join("\n"));
  }

  start(opt)
  {
    this.buildJailConf();
    const ip   = this.prop("shmocker:ip");
    const name = this.prop("shmocker:name");

    this.mount();

    try {
      cp.execSync("ifconfig lo1 || ifconfig lo1 create 2> /dev/null");
    } catch(e) {}

    for(const vol of opt.volumes)
      this.mountVolume(vol.src, vol.dst, vol.mode); // FIXME: volumes

    if(ip !== false)
    {
      this.updateFwds(ip, opt.ports);
      this.updateEtcHosts("/etc/hosts", {name: ip});
    }

    if(opt.links.length)
      this.updateLinks(opt.links);

    let term = '';

    if (process.stdin.isTTY) {
      if(!opt.detach)
        term = "< /dev/tty > /dev/tty 2> /dev/tty";
    }

    const cmd = `jail -qf /tmp/jail${this.id}.conf -c ${this.id} ${term}`

    let child;
    let res = 0;
    try {
      child = cp.execSync(cmd, {stdio: 'inherit'});
      res = true;
    } catch(e) {
      res = false;
    }

    this.stop();

    return res;
  }

  stop()
  {
    this.buildJailConf();

    try {
      cp.execSync(`jail -qf /tmp/jail${this.id}.conf -r ${this.id}`);
    } catch(e) {}

    this.umount();

    try {
      fs.unlinkSync(`/tmp/jail${this.id}.conf`);
    } catch(e) {}

    const ip = this.prop("shmocker:ip");
    if(ip != "")
      if(ip != false)
      {
        this.updateFwds(ip, []);
        try {
          cp.execSync(`ifconfig lo1 delete ${ip} 2> /dev/null`);
        } catch(e) {}
      }
  }

  exec(cmd, opt)
  {
    let term = '';
    if (process.stdin.isTTY) {
      if(!opt.detach)
        term = "< /dev/tty > /dev/tty 2> /dev/tty";
    }

    const command = `jexec ${this.id} ${cmd.map(c => Util.escapeshellarg(c)).join(" ")} ${term}`;

    let res = 0;
    try {
      cp.execSync(command, {stdio: 'inherit'});
      return true;
    } catch(e) {
      return false;
    }
  }

  // ====

  updateLinks(links)
  {
//     file = "/mnt/id/etc/hosts";
//     if(!file_exists(file))
//       return;

//     conts = this.server.listContainers();


//     res = [];
//     foreach(links as link)
//     {
//       foreach(conts as cont)
//         if(cont['name'] == link['name'])
//           if(cont['running'])
//             if(cont['ip'] != '-')
//             {
//               res[link['alias']] = cont['ip'];
//               break;
//             }
//     }

//     this.updateEtcHosts(file, res);
  }

  updateFwds(fwds)
  {
//     i = explode(".", ip, 4);
//     pipe = popen("pfctl -a 'shmocker/{i[3]}' -f- 2> /dev/null > /dev/null", "w");
//     if(!pipe)
//     {
//       echo "Unable to access pfctl\n";
//       return false;
//     }

//     data = [];
//     foreach (fwds as fwd)
//       fwrite(pipe, "rdr proto tcp from any to self port {fwd['dst']} -> ip port {fwd['src']}\n");

//     pclose(pipe);
  }

  //   readEtcHosts(file)
//   {
//     result = [];
//     foreach(file(file) as l)
//     {
//       line = trim(l);
//       if(line[0] == "#")
//         continue;

//       if(line == "")
//         continue;

//       line = preg_split("#[ \t]+#", line);

//       if(count(line) < 2)
//         continue;

//       ip = array_shift(line);
//       result[ip] = line;
//     }

//     return result;
//   }

//   writeEtcHosts(file, data)
//   {
//     res = [];
//     foreach(data as ip => names)
//       res[] = "ip " . implode(" ", names);

//     file_put_contents(file, implode("\n", res)."\n");
//   }

  updateEtcHosts(file, links)
  {
//     hosts = this.readEtcHosts(file);

//     foreach(links as host => myip)
//     {
//       hostname = "{host}.ics.my";
//       foreach(hosts as ip => names)
//       {
//         foreach(names as n => name)
//           if(name == hostname)
//             unset(names[n]);

//         if(count(names) == 0)
//           unset(hosts[ip]);
//       }

//       if(host != false)
//         hosts[myip] = array(hostname);
//     }

//     this.writeEtcHosts(file, hosts);
  }

  // ====

  toJSON()
  {
    return {
      id: this.id,
      name: this.name,
      image: this.image,
      cmd: this.cmd,
      created: this.created,
      running: this.running,
      ports: this.ports,
      mountpoint: this.mountpoint,
      zpath: this.zpath,
    }
  }
}

module.exports = Container;