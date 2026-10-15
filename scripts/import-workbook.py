import argparse
import datetime
import json
import pathlib

import openpyxl


parser = argparse.ArgumentParser(description="Convert the Emi House workbook into the shop JSON model.")
parser.add_argument("source", type=pathlib.Path)
parser.add_argument("output", type=pathlib.Path)
args = parser.parse_args()

workbook = openpyxl.load_workbook(args.source, read_only=True, data_only=True)
orders = []
for index, row in enumerate(list(workbook["ĐƠN HÀNG"].values)[3:], 4):
    if len(row) < 11 or not row[5] or not isinstance(row[0], datetime.datetime):
        continue
    item = {
        "product": str(row[5]).strip(),
        "size": str(row[6] or "").strip(),
        "quantity": int(row[7] or 1),
        "price": float(row[8] or 0),
        "cost": float(row[9] or 0),
    }
    if row[2]:
        order_id = f"EH-{int(row[1]):04}"
        status = "Đã gửi" if row[10] == "Đang giao" else str(row[10] or "Mới").strip()
        orders.append(
            {
                "id": order_id,
                "date": row[0].strftime("%Y-%m-%d"),
                "created_at": row[0].strftime("%Y-%m-%d"),
                "customer": str(row[2]).strip(),
                "phone": str(row[3] or "").strip(),
                "address": str(row[4] or "").strip(),
                **item,
                "status": status,
                "note": str(row[11] or "").strip(),
                "sourceRow": index,
                "items": [{**item, "id": f"{order_id}-1", "color": ""}],
            }
        )
    else:
        order = orders[-1]
        item["id"] = f"{order['id']}-{len(order['items']) + 1}"
        item["color"] = ""
        order["items"].append(item)
        order["quantity"] += item["quantity"]
        order["price"] += item["price"]
        order["cost"] += item["cost"]
        order["product"] = " + ".join(dict.fromkeys(line["product"] for line in order["items"]))
        order["size"] = ", ".join(dict.fromkeys(line["size"] for line in order["items"] if line["size"]))
        if row[11]:
            order["note"] = (order["note"] + " " + str(row[11])).strip()

expenses = []
for row in list(workbook["DOANH THU"].values)[9:]:
    if row and isinstance(row[0], datetime.datetime) and len(row) > 8 and isinstance(row[8], (int, float)) and row[8]:
        expenses.append(
            {
                "id": f"ADS-{len(expenses) + 1:03}",
                "date": row[0].strftime("%Y-%m-%d"),
                "category": "Quảng cáo",
                "name": "Facebook Ads",
                "amount": float(row[8]),
                "note": "Nhập từ sheet DOANH THU",
                "adFeeRate": 11.1,
            }
        )

settings_rows = list(workbook["SETTING CHI PHÍ"].values)
products = []
for row in settings_rows[3:]:
    if len(row) > 5 and row[3] and str(row[3]).strip().casefold() not in {"nhiều sp", "nhiều sản phẩm"}:
        products.append({"name": str(row[3]).strip(), "price": float(row[4] or 0), "cost": float(row[5] or 0)})

settings_values = {str(row[0]).strip(): row[1] for row in settings_rows[3:] if row and row[0]}
data = {
    "orders": orders,
    "expenses": expenses,
    "products": products,
    "settings": {
        "shipping": float(settings_values.get("Phí ship đi (+1k bao bì)", 0)),
        "returnShipping": float(settings_values.get("Phí ship hoàn", 0)),
        "platformRate": float(settings_values.get("Phí nền tảng FB (% Ads)", 0)) * 100,
        "cardRate": float(settings_values.get("Phí thẻ Ads (% Ads)", 0)) * 100,
        "returnRateThreshold": 15,
    },
    "undatedInbound": 146000,
    "source": args.source.name,
    "inventory": {"returnReceipts": [], "procurementTaken": [], "allocations": []},
}

args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print(
    json.dumps(
        {
            "orders": len(orders),
            "items": sum(len(order["items"]) for order in orders),
            "expenses": len(expenses),
            "products": len(products),
        }
    )
)
