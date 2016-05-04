Array.prototype.myFind = function(obj) {
    return this.filter(function(item) {
        for (var prop in obj)
            if (!(prop in item) || obj[prop] !== item[prop])
                 return false;
        return true;
    });
};

var array = [
  {
    username : "spino9330",
    name : "Gianmarco Spinaci"
  },
  {
    username : "94tinaT",
    name : "Valentina Tosto"
  }
]

console.log(array.myFind({"username":"94tinaT"}));
