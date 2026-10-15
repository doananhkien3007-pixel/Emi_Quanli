const images:Record<string,string>={
 'Váy lụa xanh':'/products/hoa-xanh.png',
 'Váy lụa hoa to':'/products/hoa-to.jpg',
 'Váy lụa hoa nhí':'/products/hoa-nhi.jpg',
 'Váy lụa hoa tím':'/products/tim.jpg',
 'Váy lụa hoa hồng':'/products/hong.jpg',
};

export function productImage(name:string){return images[name];}
