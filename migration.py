import sqlite3

def migrate():
    conn = sqlite3.connect('instance/explorer.db')
    try:
        conn.execute('ALTER TABLE users ADD COLUMN permissions VARCHAR DEFAULT \'{"tabs": [], "agents": "*"}\'')
        conn.commit()
        print("Migrated successfully")
    except sqlite3.OperationalError as e:
        print("Error or already migrated:", e)
    finally:
        conn.close()

if __name__ == '__main__':
    migrate()
