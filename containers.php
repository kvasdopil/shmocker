<?

class Containers
{
  public function bootstrap($root)
  {
    $zfsl = explode("\n", trim(shell_exec("zfs list -H $root")));
    if(count($zfsl) < 0)
      return "zfs partition '$root' not found";

    shell_exec("zfs set shmocker:root=1 $root");
    shell_exec("zfs create -omountpoint=legacy $root/images");  
    shell_exec("zfs create -omountpoint=legacy $root/jails");  

    return true;
  }

  public function listContainers()
  {
    $result = array();

    $path = $this->getPath();
    
    foreach($this->getZfs() as $zfs)
      if(preg_match("#^$path/jails/([0-9a-f]+)#", $zfs[0], $r))
      {
        $name = $r[1];

        $result[] = array(
          "name" => $this->zfsProperty("jails/$name", "shmocker:name"),
          "id" => $name,
          "image" => $this->getOrigin($name),
          "created" => $this->zfsProperty("jails/$name", "creation"),
          "cmd" => $this->zfsProperty("jails/$name", "shmocker:cmd"),
          "running" => $this->getContainerStatus($name)
        );
      }

    return $result;
  }

  private function getContainerStatus($jail)
  {
    $jls = explode("\n", trim(shell_exec("jls -N -j $jail 2> /dev/null")));
    array_shift($jls);

    if(count($jls) > 0)
      return true;

    return false;
  }

  public function createContainer($image, $cmd, $name = false)
  {
    if($name === false)
      $name = $this->getId();

    $ip = $this->getIp();

    $path = $this->getPath();
    shell_exec(
      "zfs clone".
      " -o shmocker:ip=$ip".
      " -o shmocker:cmd=".escapeshellarg(implode(" ", $cmd)).      
      " -o mountpoint=legacy $path/images/{$image}@ok".
      " $path/jails/$name"
    );

    return $name;
  }

  public function removeContainer($name)
  {
    $path = $this->getPath();
    shell_exec("umount -f $path/jails/{$name} 2> /dev/null");
    shell_exec("zfs destroy $path/jails/{$name}");

    $this->removePurgedImages();

    return $name;
  }

  public function startContainer($cont, $opt)
  {
    $this->buildJailConf($cont);
    $ip  = $this->zfsProperty("jails/$cont", "shmocker:ip");

    $path = $this->getPath();

    mkdir("/mnt/jails/$cont");
    shell_exec("mount -t zfs $path/jails/$cont /mnt/jails/$cont");
    foreach($opt['volumes'] as $vol)
    {
      shell_exec("kldload -n nullfs");

      $m = "";
      if($vol['mode'] == "ro")
        $m = "-oro";

      shell_exec("mount -t nullfs $m {$vol['src']} /mnt/jails/$cont/{$vol['dst']}");
    }
    passthru("jail -qf /tmp/jail.conf -c $cont");

    $this->stopContainer($cont);
  }

  public function stopContainer($cont)
  {
    $this->buildJailConf($cont);
    shell_exec("jail -qf /tmp/jail.conf -r $cont");

    foreach(explode("\n", trim(shell_exec("mount"))) as $mount)
    {
      $mount = preg_split("#[ \t]+#", $mount);
      if(preg_match("#^/mnt/jails/$cont#", $mount[2]))
        shell_exec("umount {$mount[2]} 2> /dev/null");
    }

    shell_exec("ifconfig lo1 delete $ip");
  }

  public function execCommandInContainer($cont, $cmd)
  {    
    passthru("jexec $cont ".escapeshellcmd(implode(" ", $cmd)));
  }

  // == images ==
  
  public function listImages()
  {
    $result = array();

    $path = $this->getPath();

    foreach($this->getZfs() as $zfs)
      if(preg_match("#^$path/images/([0-9A-Za-z]+)@ok\$#", $zfs[0], $r))
      {
        $id = $r[1];        

        if($this->zfsProperty("images/$id", "shmocker:remove") == "1")
          continue;

        $result[] = array(
          "name" => $this->zfsProperty("images/$id", "shmocker:name"),
          "id" => $id,
          "tag" => $this->zfsProperty("images/$id", "shmocker:tag"),
          "size" => $this->zfsProperty("images/$id", "referenced"),
          "created" => $this->zfsProperty("images/$id", "creation"),
        );
      }

    return $result;
  }

  public function removeImage($image)
  {
    $path = $this->getPath();
    
    shell_exec("zfs set shmocker:remove=1 $path/images/$image");
    $this->removePurgedImages();

    return $image;
  }

  public function createImageFromContainer($cont)
  {
    $path = $this->getPath();
    $id = $this->getId();

    shell_exec("zfs snapshot $path/jails/{$cont}@ok");
    shell_exec("zfs clone $path/jails/{$cont}@ok $path/images/$id");
    shell_exec("zfs promote $path/images/$id");

    return $id;
  }

  public function renameImage($id, $name)
  {
    $path = $this->getPath();
    $name = explode(":", $name, 2);

    shell_exec("zfs set shmocker:name={$name[0]} $path/images/$id");

    if(count($name) > 1)
      shell_exec("zfs set shmocker:tag={$name[1]} $path/images/$id");
  }  

  public function loadImage()
  {
    $id = $this->getId();
    $root = $this->getPath();
    system("zfs recv $root/images/$id", $r);
    if($r == 0)
      return $id;

    return false;
  }

  public function fetchImage($name)
  {
    $id = $this->getId();
    $root = $this->getPath();

    system("fetch -o- http://download.a-real.ru/$name.img.txz | tar xOf - bsd.img | zfs recv $root/images/$id", $r);
    if($r == 0)
      return $id;

    return false; 
  }

  public function saveImage($id)
  {
    $root = $this->getPath();
    system("zfs send -R $root/images/$id@ok");
  } 

  public function renameContainer($id, $name)
  {
    $root = $this->getPath();
    $name = escapeshellarg($name);

    shell_exec("zfs set shmocker:name=$name $root/jails/$id");
  }

  public function diffForContainer($id)
  {
    $root = $this->getPath();
    $parent = $this->getOrigin($id);
    $diff = explode("\n", trim(shell_exec("zfs diff $root/images/$parent@ok $root/jails/$id")));

    return $diff;
  }

  // === private functions ===

  private $path = false;
  private function getPath()
  {
    if($this->path !== false)
      return $this->path;

    foreach(explode("\n", trim(shell_exec("zfs get -s local -Hr shmocker:root"))) as $line)
    {
      $line = explode("\t", $line);
      return $this->path = $line[0];
    }

    return false;
  }

  private function getId()
  {
    return dechex(rand(0x100000,0xffffff)) . dechex(rand(0x100000,0xffffff));
  } 

  private function getZfs()
  {
    $result = array();
    $list = explode("\n", trim(shell_exec("zfs list -Hp -t all -r " . $this->getPath())));
    foreach($list as $l)
      $result[] = explode("\t", $l);

    return $result;
  }

  private function zfsProperty($name, $field)
  {
    $path = $this->getPath();
    $res = trim(shell_exec("zfs get -Hp $field $path/$name"));

    if($res == "")
      return false;

    $res = explode("\t", $res);

    return $res[2];
  }

  private function getOrigin($jail)
  {   
    $parent = $this->zfsProperty("jails/$jail", "origin");
    if($parent === false)
      return false;

    if(!preg_match("#images/(.+)@ok#", $parent, $m))
      return false;

    return $m[1];
  }

  private function getIp()
  {
    return "172.0.0.".rand(2,100);
  }

  private function buildJailConf($name)
  {
    $path = $this->getPath();
    
    $ip  = $this->zfsProperty("jails/$name", "shmocker:ip");
    $cmd = $this->zfsProperty("jails/$name", "shmocker:cmd");

    $data = array(
      "exec.start = \"$cmd\";",
      //"exec.poststart = \"$cmd\";",
      "exec.stop  = \"/bin/sh /etc/rc.shutdown\";",
      //"exec.poststop  = \"umount /mnt/jails/$name/dev 2> /dev/null\";",
      "exec.clean;",
      "mount.devfs;",
      "allow.raw_sockets;",
      "",    
      "path = \"/mnt/jails/".'$'."name\";",
      "",
      "$name {",
      "  host.hostname = \"$name\";",
      "  interface = \"lo1\";",
      "  ip4.addr = \"$ip\";",
      //"  persist;",
      "}",
    );
    file_put_contents("/tmp/jail.conf", implode("\n", $data));
  }

  private function removePurgedImages()
  {
    // TODO repeat purge on success
    $root = $this->getPath();
    $images = explode("\n", trim(shell_exec("zfs get -s local -Hr shmocker:remove $root/images")));
    foreach($images as $img)
    {
      $img = explode("\t", $img);
      if($img[2] == 1)
        system("zfs destroy -r {$img[0]} 2> /dev/null", $r);
    }
  }
}