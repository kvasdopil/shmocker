#!/bin/sh

set -e

DOCKERFILE=$1
THENAME=$2

shift
shift

DOCKERFILEDIR=`realpath $DOCKERFILE`
DOCKERFILEDIR=`dirname $DOCKERFILEDIR`

ID=none
RUNOPTIONS=""
IMGOPTIONS=""
DEFAULTCMD=""

SHMOCKER="docker"

# export build-time env vals
for VAR in $@
do
  export $VAR
done

FROM()
{
  if [ `$SHMOCKER images $1 | grep -c .` -lt 2 ]
  then
    echo "$1: image not found"
    exit 1
  fi

  echo "Building $THENAME from $1..."
  ID=`$SHMOCKER create $1 sh`
}

SAVE()
{
  local NAME=$1

  if [ `$SHMOCKER images $NAME | grep -c .` -gt 1 ]
  then
    $SHMOCKER rmi $NAME
  fi

  echo $SHMOCKER commit $IMGOPTIONS $ID $NAME | sh
  $SHMOCKER rm $ID

  echo "Done"
}

RUN()
{
  if [ $# -eq 0 ]
  then
    $SHMOCKER start -d $RUNOPTIONS $ID
  else
    echo $* | $SHMOCKER start -d $RUNOPTIONS $ID
  fi
}

ENV()
{
  IMGOPTIONS="$IMGOPTIONS -e $1"
}

VOLUME()
{
  RUNOPTIONS="$RUNOPTIONS -v $1"
}

COPY()
{
  local FILE=$1
  local DST=$2

  if [ `echo $FILE | grep -Ec ^/` -gt 0 ]
  then
    $SHMOCKER cp $FILE $ID:$DST
  else
    $SHMOCKER cp $DOCKERFILEDIR/$FILE $ID:$DST
  fi
}

CMD()
{
  IMGOPTIONS="$IMGOPTIONS --cmd '$@'"
}

if [ ! -r $DOCKERFILE ]
then
  echo "Cannot open $DOCKERFILE"
  exit 1
fi

. $DOCKERFILE

SAVE $THENAME

exit 0
